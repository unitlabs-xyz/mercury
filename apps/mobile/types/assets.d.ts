/**
 * Fonts and images are imported, not `require`d.
 *
 * Metro resolves either to the same thing — a number in its asset registry —
 * but only one of them is an import the linter and the module graph can see.
 * TypeScript needs telling what the extension yields, which is what this is.
 */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}
declare module "*.otf" {
  const asset: number;
  export default asset;
}
declare module "*.webp" {
  const asset: number;
  export default asset;
}
declare module "*.png" {
  const asset: number;
  export default asset;
}
