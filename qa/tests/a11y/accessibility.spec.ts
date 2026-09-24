import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { publicRoutes, runtimeGuard, waitForStablePage } from '../helpers/project';

for (const route of publicRoutes()) {
  test(`acessibilidade essencial ${route}`, async ({ page }, testInfo) => {
    const finishGuard = runtimeGuard(page, testInfo);
    await page.goto(route);
    await waitForStablePage(page);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const blocking = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    if (result.violations.length) {
      await testInfo.attach('axe-report.json', { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
    }
    expect.soft(blocking.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      targets: item.nodes.map((node) => node.target)
    })), 'Violações sérias/críticas de acessibilidade').toEqual([]);
    await finishGuard();
  });
}
