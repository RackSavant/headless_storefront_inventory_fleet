import type { Product } from "./types";

export async function prepareTryOnReferences(
  items: Product[],
  readPhoto: (url: string) => Promise<string>,
  renderProduct: (product: Product) => Promise<string>,
) {
  if (!items.length || items.length > 6) throw new Error("Choose between one and six items for AI try-on.");
  return Promise.all(items.map(async (product) => {
    const actualPhoto = !!product.image_url && !product.image_credit;
    let image: string;
    if (actualPhoto) {
      try {
        image = await readPhoto(product.image_url!);
      } catch {
        throw new Error(`Could not load the product photo for ${product.title}. Check image access before trying again.`);
      }
    } else {
      image = await renderProduct(product);
    }
    return {
      title: product.title.slice(0, 120),
      role: product.role,
      image,
      reference: actualPhoto ? "product-photo" as const : "approximation" as const,
    };
  }));
}
