import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const CartesianAxesAndGrid: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Jan</td>
            <td>120</td>
          </tr>
          <tr>
            <td>Feb</td>
            <td>132</td>
          </tr>
          <tr>
            <td>Mar</td>
            <td>101</td>
          </tr>
          <tr>
            <td>Apr</td>
            <td>134</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-grid axis="y"></ui-chart-grid>
    </ui-chart>
    <p class="muted sm">
      Axes + grid with no series — the plot area, ticks, and grid lines render from the dataset
      alone.
    </p>
  `,
};

export const MixedBarAndLine: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Jan</td>
            <td>120</td>
            <td>115</td>
          </tr>
          <tr>
            <td>Feb</td>
            <td>132</td>
            <td>120</td>
          </tr>
          <tr>
            <td>Mar</td>
            <td>101</td>
            <td>125</td>
          </tr>
          <tr>
            <td>Apr</td>
            <td>134</td>
            <td>130</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-grid axis="y"></ui-chart-grid>
      <ui-chart-bar key="Revenue" label="Revenue"></ui-chart-bar>
      <ui-chart-line key="Target" label="Target" curve="monotone" marks></ui-chart-line>
      <ui-chart-legend></ui-chart-legend>
      <ui-chart-tooltip></ui-chart-tooltip>
    </ui-chart>
    <p class="muted sm">
      A bar series and a line series sharing one category axis, each registering independently — the
      two chart types tree-shake apart since each is its own module.
    </p>
  `,
};

export const Sparkline: Story = {
  render: () => html`
    <div class="row gap">
      <ui-chart class="sparkline" style="color: var(--chart-1)">
        <ui-chart-line values="4 7 5 9 12 8 14 11 16"></ui-chart-line>
      </ui-chart>
      <ui-chart class="sparkline" style="color: var(--chart-2)">
        <ui-chart-line values="16 12 13 9 10 6 7 4 3" area></ui-chart-line>
      </ui-chart>
    </div>
    <p class="muted sm">
      The sparkline recipe: no axes, grid, or legend — just an inline value series in a small box.
    </p>
  `,
};
