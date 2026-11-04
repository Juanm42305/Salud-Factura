import { useState } from "react";
import Caja from "./pages/Caja";
import Facturacion from "./pages/Facturacion";
import Glosas from "./pages/Glosas";
import Cartera from "./pages/Cartera";

const pages = { Caja, Facturacion, Glosas, Cartera } as const;
type PageName = keyof typeof pages;

export default function App() {
  const [page, setPage] = useState<PageName>("Caja");
  const Page = pages[page];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>SaludFactura</strong>
        {(Object.keys(pages) as PageName[]).map((name) => (
          <button key={name} onClick={() => setPage(name)} disabled={name === page}>
            {name}
          </button>
        ))}
      </header>
      <main style={{ marginTop: 24 }}>
        <Page />
      </main>
    </div>
  );
}
