export interface ReportSection {
  title: string
  body: string
}

export interface SeoReportInput {
  domain: string
  generatedAt?: string
  sections: ReportSection[]
}

export function renderReportMarkdown(input: SeoReportInput): string {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const sections = input.sections.map(section => `## ${section.title}\n\n${section.body}`).join('\n\n')
  return `# SEO Report — ${input.domain}\n\nGenerated: ${generatedAt}\n\n${sections}\n`
}
