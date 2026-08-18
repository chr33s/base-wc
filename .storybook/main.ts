import type { StorybookConfig } from "@storybook/web-components-vite";

const config: StorybookConfig = {
  // Stories are colocated with the components in `src/`.
  stories: ["../src/*.stories.ts"],
  addons: ["@storybook/addon-a11y"],
  framework: { name: "@storybook/web-components-vite", options: {} },
  core: { disableTelemetry: true },
};

export default config;
