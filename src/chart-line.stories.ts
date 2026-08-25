import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

const TABLE = html`
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
      <tr>
        <td>May</td>
        <td>90</td>
      </tr>
      <tr>
        <td>Jun</td>
        <td>230</td>
      </tr>
    </tbody>
  </table>
`;

export const ChartLine: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-line key="Revenue" marks></ui-chart-line>
    </ui-chart>
  `,
};

export const ChartLineMonotone: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-line key="Revenue" curve="monotone" marks></ui-chart-line>
    </ui-chart>
  `,
};

export const ChartLineArea: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      ${TABLE}
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-line key="Revenue" curve="monotone" area></ui-chart-line>
    </ui-chart>
  `,
};
