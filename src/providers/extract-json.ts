// claude CLI가 돌려준 글자에서 JSON 덩어리만 뽑아낸다.
// 가끔 코드블럭(```json)이나 앞뒤 설명이 붙어 와도 견디게 한다.
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fence ? fence[1] : trimmed).trim();
  if (body.startsWith("{")) {
    return body;
  }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return body.slice(start, end + 1);
  }
  return body;
}
