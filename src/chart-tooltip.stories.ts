import { html } from "lit";
import type { Meta, StoryObj } from "@storybook/web-components-vite";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

export const ChartTooltip: Story = {
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
            <td>90</td>
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
      <ui-chart-bar key="Revenue" label="Revenue"></ui-chart-bar>
      <ui-chart-bar key="Cost" label="Cost"></ui-chart-bar>
      <ui-chart-tooltip trigger="axis"></ui-chart-tooltip>
    </ui-chart>
    <p class="muted sm">
      Hover a column (or focus the chart and use the arrow keys) to move the axis-trigger highlight
      — <code>ui-chart-tooltip</code> listens for the chart's bubbling <code>highlight</code> event,
      builds a small table of every visible series' value at the active month, and follows the
      pointer as a <code>popover="manual"</code> element. Storybook's static render can't simulate a
      live hover, so this story documents the wired-up markup rather than an animated interaction.
    </p>
  `,
};

export const ChartTooltipItemTrigger: Story = {
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
            <td>90</td>
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
      <ui-chart-line key="Revenue" label="Revenue" marks></ui-chart-line>
      <ui-chart-line key="Cost" label="Cost" marks></ui-chart-line>
      <ui-chart-tooltip trigger="item">
        <template>
          <div data-tooltip-row>{label}: {value}</div>
        </template>
      </ui-chart-tooltip>
    </ui-chart>
    <p class="muted sm">
      <code>trigger="item"</code> shows only the specifically-hovered series (matched by the
      highlight event's <code>seriesIndex</code> — its palette slot, not its
      <code>series</code> key, so a bar and a line plotting the same column stay distinct) rather
      than every visible series. Hovering a bare line's stroke resolves to its whole-column band,
      not one specific series — this story adds <code>marks</code> so each line has its own
      hoverable points to demonstrate item triggering with. This story also demonstrates the
      authored-<code>&lt;template&gt;</code> escape hatch: the tooltip clones the template once per
      row and substitutes <code>{label}</code>/<code>{value}</code> instead of building its default
      table.
    </p>
  `,
};
