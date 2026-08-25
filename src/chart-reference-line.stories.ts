import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const ChartReferenceLine: Story = {
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
      <ui-chart-bar key="Revenue"></ui-chart-bar>
      <ui-chart-reference-line axis="y" value="115" label="Target"></ui-chart-reference-line>
    </ui-chart>
    <p class="muted sm">
      The dashed-in-CSS reference line marks a target of 115 against the Revenue bars.
    </p>
  `,
};
