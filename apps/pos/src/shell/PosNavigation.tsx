import { NavLink } from "react-router-dom";

const navigation = [
  { label: "Kasir", path: "/kasir" },
  { label: "Tertahan", path: "/tertahan" },
  { label: "Transaksi", path: "/transaksi" },
  { label: "Retur", path: "/retur" },
  { label: "Shift", path: "/shift" },
] as const;

export function PosNavigation() {
  return (
    <nav aria-label="Navigasi utama POS" className="pos-navigation">
      {navigation.map((item) => (
        <NavLink
          className={({ isActive }) => `pos-navigation__link${isActive ? " is-active" : ""}`}
          key={item.path}
          to={item.path}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
