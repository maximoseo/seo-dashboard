export function createSeoTaskFromAlert(alert) {
    const priority = alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'high' : 'medium';
    return {
        id: `task-${alert.id}`,
        domain: alert.domain,
        title: `Fix: ${alert.title}`,
        status: 'queued',
        priority,
        module: alert.module,
        brief: `${alert.detail}\n\nEvidence: ${JSON.stringify(alert.evidence)}`,
        acceptanceCriteria: [
            'Root cause is identified and documented.',
            'Fix is implemented without exposing secrets or fake live data.',
            'Relevant dashboard screen shows verified live/cached/unavailable state.',
            'Production smoke verifies the alert condition is resolved or accurately tracked.',
        ],
        createdAt: new Date().toISOString(),
    };
}
