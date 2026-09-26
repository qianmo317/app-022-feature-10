import { expect, test, type Page } from '@playwright/test';

async function createWorksheet(page: Page, chars: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
}

/** 通过编辑器顶栏的导入入口上传一个 JSON 文件 */
async function importJson(page: Page, name: string, payload: unknown): Promise<void> {
  await page.locator('[data-testid="import-strokes"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

const ONE_STROKE = { strokes: ['M10 80 L90 20'], medians: [[[10, 80], [90, 20]]] };
const TWO_STROKES = {
  strokes: ['M10 80 L90 20', 'M10 20 L90 80'],
  medians: [
    [[10, 80], [90, 20]],
    [[10, 20], [90, 80]],
  ],
};

test.describe('导入笔顺数据管理', () => {
  test('管理列表：显示每个字的笔画、来源文件与导入时间', async ({ page }) => {
    await createWorksheet(page, '㐀㐁');
    await importJson(page, 'my-pack.json', { chars: { 㐀: ONE_STROKE, 㐁: TWO_STROKES } });
    await expect(page.locator('[data-testid="import-msg"]')).toContainText('已导入 2 条');
    await expect(page.locator('[data-testid="data-stats"]')).toContainText('已导入 2 字');

    await page.click('[data-testid="manage-imports"]');
    const rowA = page.locator('[data-testid="import-row-㐀"]');
    await expect(rowA).toBeVisible();
    await expect(rowA).toContainText('my-pack.json'); // 来源文件
    await expect(rowA).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/); // 导入时间
    await expect(rowA.locator('td').nth(1)).toHaveText('1'); // 笔画数
    const rowB = page.locator('[data-testid="import-row-㐁"]');
    await expect(rowB.locator('td').nth(1)).toHaveText('2');
    await page.click('[data-testid="close-manager"]');
    await expect(page.locator('[data-testid="import-manager"]')).toHaveCount(0);
  });

  test('删除单个导入字：预览与笔顺演示立即按退回后的数据重画', async ({ page }) => {
    await createWorksheet(page, '㐀');
    await expect(page.locator('[data-no-stroke]').first()).toBeVisible();
    await expect(page.locator('[data-testid="player-no-data"]')).toBeVisible();

    await importJson(page, 'a.json', { chars: { 㐀: ONE_STROKE } });
    await expect(page.locator('[data-no-stroke]')).toHaveCount(0);
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="stroke-source"]')).toContainText('导入（a.json）');

    await page.click('[data-testid="manage-imports"]');
    await page.click('[data-testid="remove-import-㐀"]');
    await expect(page.locator('[data-testid="import-empty"]')).toBeVisible();
    await page.click('[data-testid="close-manager"]');

    // 退回后预览重新出现「无笔顺数据」，播放器也回到无数据态
    await expect(page.locator('[data-no-stroke]').first()).toBeVisible();
    await expect(page.locator('[data-testid="player-no-data"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-stats"]')).toContainText('已导入 0 字');
  });

  test('清空全部导入并退回内置数据', async ({ page }) => {
    await createWorksheet(page, '㐀㐁');
    await importJson(page, 'a.json', { chars: { 㐀: ONE_STROKE, 㐁: TWO_STROKES } });
    await expect(page.locator('[data-no-stroke]')).toHaveCount(0);

    await page.click('[data-testid="manage-imports"]');
    await page.click('[data-testid="clear-imports"]');
    // 二次确认，防止误清空
    await page.click('[data-testid="confirm-clear-imports"]');
    await expect(page.locator('[data-testid="import-empty"]')).toBeVisible();
    await page.click('[data-testid="close-manager"]');

    await expect(page.locator('[data-testid="data-stats"]')).toContainText('已导入 0 字');
    await expect(page.locator('[data-no-stroke]').first()).toBeVisible();
  });

  test('导入与已导入字冲突：默认保留旧数据，确认后不覆盖', async ({ page }) => {
    await createWorksheet(page, '㐀');
    await importJson(page, 'a.json', { chars: { 㐀: ONE_STROKE } });
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(1);

    await importJson(page, 'b.json', { chars: { 㐀: TWO_STROKES } });
    await expect(page.locator('[data-testid="conflict-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="conflict-row-㐀"]')).toContainText('导入：a.json');
    await expect(page.locator('[data-testid="conflict-row-㐀"]')).toContainText('1 笔');
    await expect(page.locator('[data-testid="conflict-row-㐀"]')).toContainText('2 笔');
    // 默认就是「保留旧」，直接确认
    await page.click('[data-testid="confirm-import"]');
    await expect(page.locator('[data-testid="import-msg"]')).toContainText('保留原数据');
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(1); // 仍是旧的 1 笔

    await page.click('[data-testid="manage-imports"]');
    await expect(page.locator('[data-testid="import-row-㐀"]')).toContainText('a.json');
  });

  test('导入冲突：选择「用新的」后覆盖旧数据', async ({ page }) => {
    await createWorksheet(page, '㐀');
    await importJson(page, 'a.json', { chars: { 㐀: ONE_STROKE } });
    await importJson(page, 'b.json', { chars: { 㐀: TWO_STROKES } });
    await page.click('[data-testid="use-new-㐀"]');
    await page.click('[data-testid="confirm-import"]');
    await expect(page.locator('[data-testid="import-msg"]')).toContainText('已导入 1 条');
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(2); // 换成新的 2 笔

    await page.click('[data-testid="manage-imports"]');
    const row = page.locator('[data-testid="import-row-㐀"]');
    await expect(row).toContainText('b.json');
    await expect(row.locator('td').nth(1)).toHaveText('2');
  });

  test('导入与内置撞字：说明来源并可覆盖，删除后退回内置', async ({ page }) => {
    await createWorksheet(page, '木');
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(4); // 内置 木 4 画
    await expect(page.locator('[data-testid="stroke-source"]')).toContainText('内置数据');

    // 导入一份 1 笔的假「木」，与内置冲突
    await importJson(page, 'wood.json', { chars: { 木: ONE_STROKE } });
    await expect(page.locator('[data-testid="conflict-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="conflict-row-木"]')).toContainText('内置数据（4 笔）');
    await page.click('[data-testid="use-new-木"]');
    await page.click('[data-testid="confirm-import"]');

    // 导入数据生效：播放器变成 1 笔，统计与面板都标明覆盖内置
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="data-stats"]')).toContainText('1 字覆盖内置');
    await expect(page.locator('[data-testid="stroke-source"]')).toContainText('覆盖内置');

    // 管理列表里标明「覆盖内置」
    await page.click('[data-testid="manage-imports"]');
    await expect(page.locator('[data-testid="import-row-木"]')).toContainText('覆盖内置');

    // 删除后立即退回内置：播放器回到 4 笔
    await page.click('[data-testid="remove-import-木"]');
    await page.click('[data-testid="close-manager"]');
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="stroke-source"]')).toContainText('内置数据');
    await expect(page.locator('[data-testid="data-stats"]')).toContainText('已导入 0 字');
  });
});
