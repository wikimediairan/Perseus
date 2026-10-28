globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/w/rest.php/v1/page/"))
    return new Response(
      JSON.stringify({
        source: "Hello world.",
        title: "Example",
        id: 42,
        latest: { id: 101 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  if (url.includes("/w/rest.php/v1/revision/101/html"))
    return new Response("<html><body><p>Hello world.</p></body></html>", {
      status: 200,
    });
  if (url.includes("/transform/html/to/wikitext/"))
    return new Response("Translated wikitext", { status: 200 });
  throw new Error(`Unexpected mocked request: ${url}`);
};
