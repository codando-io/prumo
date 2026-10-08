// Privacy guard: no CPF-shaped number (11 digits, optionally punctuated) may remain in any text
// the app displays or searches. Raw document columns (donor_doc, supplier_doc, doc) are only used
// to derive keys and masked displays, and are never selected by the app.
import assert from 'node:assert/strict';
import { DuckDBInstance } from '@duckdb/node-api';
import { DB_PATH } from '../config.mjs';

const inst = await DuckDBInstance.create(':memory:');
const con = await inst.connect();
await con.run(`ATTACH '${DB_PATH}' AS db (READ_ONLY)`);
const CPF = `'(^|[^0-9])[0-9]{3}\\.?[0-9]{3}\\.?[0-9]{3}-?[0-9]{2}([^0-9]|$)'`;

const checks = {
  entity: ['name'],
  search_index: ['label', 'kind', 'context', 'extra', 'haystack'],
  revenue: ['donor_name', 'donor_name_declared', 'description', 'document'],
  revenue_origin: ['name', 'description'],
  expense: ['supplier_name', 'supplier_name_declared', 'description', 'doc_number'],
  payment: ['description', 'doc_number'],
  candidate_summary: ['top_donor_name', 'top_private_name', 'top_supplier_name'],
  signal: ['ref_name'],
  proposal_page: ['text'],
  proposal_heading: ['text'],
  // Receita CNPJ enrichment (etl/sql/10_cnpj.sql)
  rf_company: ['razao_social', 'ente_federativo'],
  rf_establishment: ['nome_fantasia', 'situacao_especial'],
  rf_partner: ['name', 'doc_masked', 'qualificacao'],
  person_match: ['basis'],
  enrich_source: ['label', 'url', 'published'],
  // CGU sanction lists and PNCP contracts (etl/sql/11_sanctions.sql, 12_contracts.sql)
  sanction: ['name', 'category', 'details', 'authority'],
  public_contract: ['supplier_name', 'objeto', 'orgao_nome', 'unidade_nome'],
};

const exists = async (t) =>
  (await con.runAndReadAll(`SELECT count(*)::INT AS n FROM duckdb_tables() WHERE database_name = 'db' AND table_name = '${t}'`)).getRowObjectsJson()[0].n > 0;

let bad = 0;
for (const [table, cols] of Object.entries(checks)) {
  if (table.startsWith('rf_') || ['person_match', 'enrich_source', 'sanction', 'public_contract'].includes(table)) {
    if (!(await exists(table))) {
      console.log(`  -   ${table}: not built`);
      continue;
    }
  }
  for (const col of cols) {
    const rows = (await con.runAndReadAll(`SELECT count(*)::INT AS n FROM db.${table} WHERE regexp_matches(${col}, ${CPF})`)).getRowObjectsJson();
    const n = rows[0].n;
    console.log(`${n === 0 ? '  ok ' : '  ✖  '} ${table}.${col}: ${n}`);
    bad += n;
  }
}
assert.equal(bad, 0, `${bad} values still contain CPF-shaped numbers`);

// Enrichment tables: Receita publishes partner CPFs masked (***123456**) and nothing else may be kept.
if (await exists('rf_partner')) {
  const q = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson()[0].n;
  const pfBad = await q(`SELECT count(*)::INT AS n FROM db.rf_partner WHERE partner_type = 'PF' AND doc_masked IS NOT NULL AND NOT regexp_full_match(doc_masked, '\\*\\*\\*[0-9]{6}\\*\\*')`);
  console.log(`${pfBad === 0 ? '  ok ' : '  ✖  '} rf_partner PF doc_masked not in ***123456** form: ${pfBad}`);
  const pjBad = await q(`SELECT count(*)::INT AS n FROM db.rf_partner WHERE partner_type <> 'PF' AND regexp_matches(coalesce(doc_masked, ''), '(^|[^0-9])[0-9]{11}([^0-9]|$)')`);
  console.log(`${pjBad === 0 ? '  ok ' : '  ✖  '} rf_partner PJ/foreign doc_masked with 11 digits: ${pjBad}`);
  assert.equal(pfBad + pjBad, 0, 'rf_partner keeps a document that is not masked as published');
}
// No column of the new tables may hold a raw CPF (or anything named like one).
const cols = (
  await con.runAndReadAll(`SELECT table_name, column_name FROM duckdb_columns() WHERE database_name = 'db'
    AND table_name IN ('rf_company', 'rf_establishment', 'rf_cnae', 'rf_simples', 'rf_partner', 'person_match', 'enrich_source')`)
).getRowObjectsJson();
const rawCols = cols.filter((c) => /cpf|representante|telefone|email|e_mail|logradouro|cep|bairro|complemento|^numero$|(^|_)doc$/i.test(c.column_name));
console.log(`${rawCols.length === 0 ? '  ok ' : '  ✖  '} enrichment columns holding personal documents or contacts: ${rawCols.map((c) => `${c.table_name}.${c.column_name}`).join(', ') || 'none'}`);
assert.equal(rawCols.length, 0, 'enrichment tables must not carry raw CPF, contact or address columns');
console.log('privacy check passed');
