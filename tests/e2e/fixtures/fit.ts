import { expect, type Locator } from '@playwright/test';
/** Botões com o conteúdo inteiro dentro da borda: ícone + texto + espaços cabem na largura, sem quebrar linha. */
export async function expectButtonsFit(buttons: Locator) {
  for (const b of await buttons.all()) {
    const r = await b.evaluate((el) => {
      const cs = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const range = document.createRange(); range.selectNodeContents(el);
      const content = range.getBoundingClientRect().width;
      return { inner, content, h: el.getBoundingClientRect().height, text: el.textContent };
    });
    expect(r.content, `"${r.text}" não cabe no botão`).toBeLessThanOrEqual(r.inner + 1);
    expect(r.h, `"${r.text}" quebrou linha`).toBeLessThan(60);
  }
}
