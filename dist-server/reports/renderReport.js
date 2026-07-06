export function renderReportMarkdown(input) {
    const generatedAt = input.generatedAt || new Date().toISOString();
    const sections = input.sections.map(section => `## ${section.title}\n\n${section.body}`).join('\n\n');
    return `# SEO Report — ${input.domain}\n\nGenerated: ${generatedAt}\n\n${sections}\n`;
}
