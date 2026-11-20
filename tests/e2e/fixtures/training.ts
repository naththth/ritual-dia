import { expect, type Page } from '@playwright/test';
/** Abre todos os itens do treino do dia (fechados por padrão). */
export async function openTrainingItems(page: Page) {
  await page.getByTestId('titem-head').first().waitFor();
  const n = await page.getByTestId('titem-head').count();
  for (let i = 0; i < n; i++) {
    const h = page.getByTestId('titem-head').nth(i);
    if ((await h.getAttribute('aria-expanded')) === 'false') await h.click();
    await expect(h).toHaveAttribute('aria-expanded', 'true');
  }
}
