declare module "katex/contrib/auto-render" {
  interface Delimiter {
    left: string;
    right: string;
    display: boolean;
  }
  interface RenderOptions {
    delimiters?: Delimiter[];
    throwOnError?: boolean;
    errorColor?: string;
  }
  function renderMathInElement(elem: HTMLElement, options?: RenderOptions): void;
  export default renderMathInElement;
}
