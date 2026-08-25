import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const ChartLegend: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Jan</td>
            <td>120</td>
            <td>90</td>
          </tr>
          <tr>
            <td>Feb</td>
            <td>132</td>
            <td>85</td>
          </tr>
          <tr>
            <td>Mar</td>
            <td>101</td>
            <td>95</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-bar key="Revenue" label="Revenue"></ui-chart-bar>
      <ui-chart-bar key="Cost" label="Cost"></ui-chart-bar>
      <ui-chart-legend class="legend"></ui-chart-legend>
    </ui-chart>
    <p class="muted sm">
      Click a legend item to toggle that series' visibility; hover an item to highlight its series
      on the chart.
    </p>
  `,
};
