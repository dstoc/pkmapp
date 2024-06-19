export function template(content: string) {
  const template = document.createElement('template');
  template.innerHTML = content;
  return template;
}
