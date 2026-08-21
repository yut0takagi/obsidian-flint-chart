/** Starter block inserted by the "Insert chart block" command. */
export const CHART_TEMPLATE = `\`\`\`flint
chartType: Bar Chart
title: Quarterly revenue
x: quarter
y: revenue
color: region
data:
  - { quarter: Q1, revenue: 1200, region: East }
  - { quarter: Q2, revenue: 1580, region: East }
  - { quarter: Q1, revenue: 800, region: West }
  - { quarter: Q2, revenue: 1120, region: West }
\`\`\`
`;

/** Starter block that reads a Markdown table from another note. */
export const TABLE_TEMPLATE = `\`\`\`flint
chartType: Bar Chart
x: Region
y: Revenue
source: "[[Note name#Heading]]"
\`\`\`
`;
