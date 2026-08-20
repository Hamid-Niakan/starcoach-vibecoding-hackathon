import { Injectable } from "@nestjs/common";
import type { Product } from "@hackathon/contracts";

@Injectable()
export class ChatService {
  createMockAnswer(product: Product, question: string) {
    const scope =
      product === "liara" ? "مستندات لیارا" : "داده‌های تحلیلی زرین‌پال";
    return `این یک پاسخ آزمایشی از زیرساخت مشترک گفتگو است. پرسش شما دربارهٔ «${question}» دریافت شد. در مرحلهٔ بعد، این پاسخ برای ${scope} به منبع واقعی و شواهد قابل ردیابی متصل می‌شود.`;
  }
  chunks(text: string) {
    return text.split(/(?<=\s)/u).filter(Boolean);
  }
}
