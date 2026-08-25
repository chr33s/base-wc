import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const ChartScatter: Story = {
  render: () => html`
    <ui-chart class="chart" style="width: 480px">
      <table>
        <thead>
          <tr>
            <th>Weight</th>
            <th>Height</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>52</td>
            <td>158</td>
          </tr>
          <tr>
            <td>61</td>
            <td>167</td>
          </tr>
          <tr>
            <td>68</td>
            <td>172</td>
          </tr>
          <tr>
            <td>74</td>
            <td>180</td>
          </tr>
          <tr>
            <td>83</td>
            <td>176</td>
          </tr>
          <tr>
            <td>90</td>
            <td>188</td>
          </tr>
        </tbody>
      </table>
      <ui-chart-axis position="bottom" scale="linear"></ui-chart-axis>
      <ui-chart-axis position="left" scale="linear"></ui-chart-axis>
      <ui-chart-scatter x-key="Weight" key="Height" r="5"></ui-chart-scatter>
    </ui-chart>
  `,
};
