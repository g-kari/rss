import { afterEach, expect, it } from "vitest";
import { getFocusableElements } from "./modal-focus";
afterEach(() => {
  document.body.innerHTML = "";
});
it("traps focus only through visible, enabled, tabbable controls", () => {
  const root = document.createElement("div");
  root.innerHTML = `<button id="close">Close</button><div hidden><button>Hidden tab</button></div><input type="hidden"><button disabled>Disabled</button><button tabindex="-1">Inactive radio</button><div style="display:none"><input></div><div inert><button>Inert</button></div><button id="last">Last</button>`;
  document.body.appendChild(root);
  expect(getFocusableElements(root).map((element) => element.id)).toEqual(["close", "last"]);
});
