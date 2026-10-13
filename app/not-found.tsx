import { Container } from "@/components/layout/container";
import { UnavailablePage } from "@/components/layout/unavailable-page";

export default function NotFound() {
  return (
    <Container as="main" className="py-10 md:py-14">
      <UnavailablePage />
    </Container>
  );
}
