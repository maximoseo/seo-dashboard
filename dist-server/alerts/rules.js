function idFor(domain, module, title) {
    return `${domain}:${module}:${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
export function generateAlerts(snapshot) {
    const now = new Date().toISOString();
    const alerts = [];
    if (snapshot.previousOrganicTraffic && snapshot.organicTraffic != null) {
        const delta = (snapshot.organicTraffic - snapshot.previousOrganicTraffic) / snapshot.previousOrganicTraffic;
        if (delta <= -0.2) {
            alerts.push({
                id: idFor(snapshot.domain, 'Traffic', 'Organic traffic dropped'),
                domain: snapshot.domain,
                severity: delta <= -0.4 ? 'critical' : 'warning',
                module: 'Traffic',
                title: 'Organic traffic dropped',
                detail: `Organic traffic changed ${(delta * 100).toFixed(1)}% versus the previous snapshot.`,
                evidence: { organicTraffic: snapshot.organicTraffic, previousOrganicTraffic: snapshot.previousOrganicTraffic, delta },
                createdAt: now,
            });
        }
    }
    if (snapshot.previousTop10Keywords && snapshot.top10Keywords != null) {
        const lost = snapshot.previousTop10Keywords - snapshot.top10Keywords;
        if (lost >= 5) {
            alerts.push({
                id: idFor(snapshot.domain, 'Rankings', 'Top 10 keyword loss'),
                domain: snapshot.domain,
                severity: lost >= 20 ? 'critical' : 'warning',
                module: 'Rankings',
                title: 'Top 10 keyword loss',
                detail: `${lost} keywords left the Top 10 versus the previous snapshot.`,
                evidence: { top10Keywords: snapshot.top10Keywords, previousTop10Keywords: snapshot.previousTop10Keywords, lost },
                createdAt: now,
            });
        }
    }
    if ((snapshot.brokenPagesWithBacklinks || 0) > 0) {
        alerts.push({
            id: idFor(snapshot.domain, 'Pages', 'Linked pages are broken'),
            domain: snapshot.domain,
            severity: 'critical',
            module: 'Pages',
            title: 'Linked pages are broken',
            detail: `${snapshot.brokenPagesWithBacklinks} pages with backlinks return an error or redirect chain.`,
            evidence: { brokenPagesWithBacklinks: snapshot.brokenPagesWithBacklinks },
            createdAt: now,
        });
    }
    if (snapshot.performanceScore != null && snapshot.performanceScore < 50) {
        alerts.push({
            id: idFor(snapshot.domain, 'Vitals', 'Performance score is poor'),
            domain: snapshot.domain,
            severity: 'warning',
            module: 'Vitals',
            title: 'Performance score is poor',
            detail: `Latest performance score is ${snapshot.performanceScore}/100.`,
            evidence: { performanceScore: snapshot.performanceScore },
            createdAt: now,
        });
    }
    for (const providerError of snapshot.providerErrors || []) {
        alerts.push({
            id: idFor(snapshot.domain, 'Integrations', `${providerError.provider} ${providerError.errorClass}`),
            domain: snapshot.domain,
            severity: providerError.errorClass === 'auth' ? 'critical' : 'info',
            module: 'Integrations',
            title: `${providerError.provider} provider issue`,
            detail: `Provider returned ${providerError.errorClass}. Data may be incomplete.`,
            evidence: providerError,
            createdAt: now,
        });
    }
    return alerts;
}
