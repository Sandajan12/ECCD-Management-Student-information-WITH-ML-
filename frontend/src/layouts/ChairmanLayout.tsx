import MainLayout from "./MainLayout";
import RouteContent from "../components/RouteContent";
import "../components/chairman/chairman.css";
// MainLayout already reproduces the legacy Chairman drawer and app bar.
// The marker scopes legacy table typography to this portal alone.
export default function ChairmanLayout() {
  return (
    <div data-chairman-portal>
      <MainLayout>
        <RouteContent />
      </MainLayout>
    </div>
  );
}
