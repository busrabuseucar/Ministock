import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('stock ledger persists through reload, rejects overselling and isolates browsers', async ({ page, browser }) => {
  await page.goto('/');
  const row = page.getByRole('row').filter({ hasText: 'ELE-001' });
  const balance = row.locator('.number');
  await expect(balance).toHaveText('24');
  const move = async (direction: 'in' | 'out', quantity: string, reason: string) => {
    await row.getByRole('button', { name: `ESP32 geliştirme kartı: stok ${direction === 'in' ? 'girişi' : 'çıkışı'}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(direction === 'in' ? 'Giren miktar' : 'Çıkan miktar').fill(quantity);
    await dialog.getByLabel('Hareket açıklaması').fill(reason);
    await dialog.getByRole('button', { name: direction === 'in' ? 'Girişi kaydet' : 'Çıkışı kaydet' }).click();
  };
  await move('out', '14', 'Browser withdrawal');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(balance).toHaveText('10');
  await move('out', '11', 'Rejected oversell');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(balance).toHaveText('10');
  await move('in', '5', 'Browser restock');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(balance).toHaveText('15');
  await page.reload();
  await expect(balance).toHaveText('15');
  await page.getByLabel('Ürün adı veya koduyla ara').fill('ELE-001');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV indir' }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('ELE-001');
  expect(csv).not.toContain('ELE-002');
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);

  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto('http://127.0.0.1:4173');
    await expect(otherPage.getByRole('row').filter({ hasText: 'ELE-001' }).locator('.number')).toHaveText('24');
  } finally { await other.close(); }
});

test('a new product and its opening stock survive reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('row').filter({ hasText: 'ELE-001' })).toBeVisible();
  await page.getByRole('button', { name: 'Ürün ekle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ürün adı', { exact: true }).fill('Tarayıcı test ürünü');
  await dialog.getByLabel('Ürün kodu', { exact: true }).fill('TEST-001');
  await dialog.getByLabel('Açılış stoku', { exact: true }).fill('7');
  await dialog.getByRole('button', { name: 'Ürünü kaydet' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'TEST-001' }).locator('.number')).toHaveText('7');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'TEST-001' }).locator('.number')).toHaveText('7');
});
