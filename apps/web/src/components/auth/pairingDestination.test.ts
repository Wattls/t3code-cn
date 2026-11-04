import { expect, it } from "vite-plus/test";
import { parsePairingSearch } from "./pairingDestination";

it("returns company visitors to their workspace without allowing arbitrary redirects", () => {
  expect(parsePairingSearch({ next: "/company" })).toEqual({ next: "/company" });
  for (const next of [
    undefined,
    "/",
    "https://example.com",
    "//example.com",
    "/company/../settings",
    ["/company"],
    { path: "/company" },
  ]) {
    expect(parsePairingSearch({ next })).toEqual({});
  }
  expect(parsePairingSearch({ host: "https://host.example", label: "server" })).toEqual({});
});
