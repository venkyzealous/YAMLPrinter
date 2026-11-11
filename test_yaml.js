const { stringifyYAML } = require('./yaml.js');

const sampleData = {
  metadata: {
    title: "Project Titan Roadmap",
    url: "https://example.com/roadmap",
    viewport: [1920, 1080],
    captured_at: "2026-10-23T06:20:00Z",
    bbox_format: "[x, y, width, height] relative to document"
  },
  layout: [
    {
      type: "heading",
      level: 1,
      text: "Project Titan Architecture & Delivery Roadmap",
      bbox: [40, 20, 800, 36],
      style: { weight: 700, size: 32, is_bold: true }
    },
    {
      type: "infographic_timeline",
      orientation: "horizontal",
      bbox: [40, 120, 900, 100],
      item_count: 3,
      items: [
        {
          bbox: [50, 130, 160, 80],
          content: "Milestone 1 Q1 2026 - Schema Lock"
        },
        {
          bbox: [350, 130, 160, 80],
          content: "Milestone 2 Q2 2026 - Agent Runtime"
        }
      ]
    },
    {
      type: "table",
      caption: "Quarterly Engineering Budget Distribution",
      bbox: [40, 250, 850, 180],
      headers: ["Module", "Lead Engineer", "Status", "Target Delivery"],
      rows: [
        ["Extraction Engine", "Core Platform Team", "In Progress", "May 2026"],
        ["YAML Serializer", "Schema Standards Lead", "Completed", "June 2026"]
      ]
    },
    {
      type: "paragraph",
      text: "This document details target state. Refer to the Official Titan Specification.",
      bbox: [40, 450, 850, 40],
      links: [
        { text: "Official Titan Specification", url: "https://example.com/spec" }
      ]
    }
  ]
};

const yamlOutput = stringifyYAML(sampleData);
console.log("=== GENERATED YAML OUTPUT ===");
console.log(yamlOutput);
console.log("=============================");

// Verify assertions
if (!yamlOutput.includes('bbox: [40, 20, 800, 36]')) {
  console.error("Assertion failed: compact bbox format missing");
  process.exit(1);
}
if (!yamlOutput.includes('Milestone 1 Q1 2026 - Schema Lock')) {
  console.error("Assertion failed: timeline item content missing");
  process.exit(1);
}
if (!yamlOutput.includes('Extraction Engine')) {
  console.error("Assertion failed: table rows missing");
  process.exit(1);
}
console.log("✓ All YAML serialization unit tests passed successfully!");
