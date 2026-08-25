import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const ChartPie: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 320px">
      <table>
        <thead>
          <tr>
            <th>Browser</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Chrome</td>
            <td>65</td>
          </tr>
          <tr>
            <td>Safari</td>
            <td>18</td>
          </tr>
          <tr>
            <td>Firefox</td>
            <td>7</td>
          </tr>
          <tr>
            <td>Edge</td>
            <td>6</td>
          </tr>
          <tr>
            <td>Other</td>
            <td>4</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-pie key="Share"></ui-chart-pie>
    </ui-chart>
  `,
};

export const ChartPieDonut: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 320px">
      <table>
        <thead>
          <tr>
            <th>Browser</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Chrome</td>
            <td>65</td>
          </tr>
          <tr>
            <td>Safari</td>
            <td>18</td>
          </tr>
          <tr>
            <td>Firefox</td>
            <td>7</td>
          </tr>
          <tr>
            <td>Edge</td>
            <td>6</td>
          </tr>
          <tr>
            <td>Other</td>
            <td>4</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-pie key="Share" inner-radius="60" pad-angle="0.02" sort></ui-chart-pie>
    </ui-chart>
    <p class="muted sm">
      A donut slice order sorted by descending value, with a small pad between slices.
    </p>
  `,
};
