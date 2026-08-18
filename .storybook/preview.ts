import type { Preview } from "@storybook/web-components-vite";
// `elements.ts` registers every custom element once for the whole preview
// iframe (stories render `ui-*` tags without importing their classes); the
// kitchen-sink `styles.css` is the plain consumer CSS that themes them.
import "../src/elements.ts";
import "../src/styles.css";

// `ui-dialog` has no built-in close part — wire any [data-close] to hide(),
// exactly as the standalone demo did (registered once for the preview).
document.addEventListener("click", (e) => {
  const closer = (e.target as Element).closest?.("[data-close]");
  const dialog = closer?.closest<HTMLElement & { hide(): void }>("ui-dialog");
  dialog?.hide();
});

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  // Theme toolbar toggle → sets `data-theme` on <html>, which styles.css keys
  // its light/dark custom properties off of.
  globalTypes: {
    theme: {
      description: "Color theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, context) => {
      document.documentElement.dataset.theme = context.globals.theme ?? "light";
      return story();
    },
  ],
};

export default preview;
