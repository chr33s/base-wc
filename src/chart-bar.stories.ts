import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const ChartBar: Story = {
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
    </ui-chart>
  `,
};

export const ChartBarGrouped: Story = {
  name: "Chart Bar (grouped)",
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
            <td>80</td>
          </tr>
          <tr>
            <td>Feb</td>
            <td>132</td>
            <td>95</td>
          </tr>
          <tr>
            <td>Mar</td>
            <td>101</td>
            <td>70</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-bar key="Revenue"></ui-chart-bar>
      <ui-chart-bar key="Cost"></ui-chart-bar>
    </ui-chart>
  `,
};

export const ChartBarStacked: Story = {
  name: "Chart Bar (stacked)",
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Online</th>
            <th>In-store</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Jan</td>
            <td>70</td>
            <td>50</td>
          </tr>
          <tr>
            <td>Feb</td>
            <td>82</td>
            <td>50</td>
          </tr>
          <tr>
            <td>Mar</td>
            <td>61</td>
            <td>40</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" key="Month" scale="band"></ui-chart-axis>
      <ui-chart-axis position="left"></ui-chart-axis>
      <ui-chart-bar key="Online" stack="revenue"></ui-chart-bar>
      <ui-chart-bar key="In-store" stack="revenue"></ui-chart-bar>
    </ui-chart>
  `,
};
