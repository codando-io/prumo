import { Container } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/editorial";

export default function NotFound() {
  return (
    <Container className="pb-16 sm:pt-8">
      <PageHeader
        title="Página não encontrada"
        lede="O endereço pode estar incompleto, ou o registro não existe nos dados do TSE para esta eleição."
        actions={[
          { label: "Ir para o início", href: "/" },
          { label: "Buscar uma candidatura, empresa ou município", href: "/busca" },
        ]}
      />
    </Container>
  );
}
