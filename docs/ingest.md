# Ingest

`POST /api/ingest` builds a collage from image URLs. A caller such as Tastemaker sends public https images and gets back view and edit links the owner can open.

The route is closed unless `INGEST_SECRET` is set. Add that variable on the Vercel project for Production (and Preview, if you call preview deployments). Use a long random string. Do not commit it. The value below is a placeholder, not a real secret.

## Request

```http
Authorization: Bearer <INGEST_SECRET>
Content-Type: application/json
```

```bash
curl -sS -X POST "https://collage-slides-studio.vercel.app/api/ingest" \
  -H "Authorization: Bearer replace-with-a-long-random-secret" \
  -H "content-type: application/json" \
  -d '{
    "title": "Reference board",
    "canvasRatio": "4:5",
    "layout": "auto",
    "images": [
      {
        "url": "https://example.com/photos/one.jpg",
        "name": "one.jpg",
        "sourceUrl": "https://example.com/posts/one"
      },
      { "url": "https://example.com/photos/two.png" }
    ]
  }'
```

| Field | |
| --- | --- |
| `images` | Required. 1 to 20 objects. |
| `images[].url` | Required. Public `https` URL of a jpeg, png, webp, or gif. |
| `images[].name` | Optional display name. The file name is used when this is omitted. |
| `images[].sourceUrl` | Optional http(s) page the image came from. Stored on the image. No credentials. |
| `title` | Optional. At most 200 characters. |
| `canvasRatio` | Optional. `1:1` (default, same as a new collage in the editor), `4:5`, `16:9`, `9:16`, or `custom`. |
| `customWidth`, `customHeight` | Used when `canvasRatio` is `custom`. Default 1080. Each must be from 1 to 8192. |
| `layout` | Optional hint. `auto` (default), `best`, `grid`, `row`, or `column`. |

`auto` places photos with the editor's Smart organize grid, using each image's measured aspect ratio. `best` picks the highest-scored layout preset. `grid` is a balanced grid in the order given. `row` and `column` are a single strip.

The server fetches each URL with a 5 second timeout and reads at most 2 MB, only far enough to measure the header. Private hosts, credentials in the URL, and non-https URLs are rejected. Images that cannot be loaded are left out.

## Response

`201`:

```json
{
  "id": "abcdefghijkl",
  "viewUrl": "https://collage-slides-studio.vercel.app/c/abcdefghijkl",
  "editUrl": "https://collage-slides-studio.vercel.app/c/abcdefghijkl?edit=EDIT_TOKEN",
  "title": "Reference board",
  "skipped": []
}
```

`viewUrl` is the read-only collage. `editUrl` opens the editor (`/c/<id>?edit=<token>`). Both are absolute URLs on the deployment that handled the request. `skipped` lists images that were not included, each as `{ "url", "reason" }`.

If every image is skipped, the route returns `400` and does not save:

```json
{ "error": "None of the images could be loaded.", "skipped": [{ "url": "https://example.com/missing.jpg", "reason": "Image request failed (404)." }] }
```

`401` means the bearer token is missing or wrong. `503` means `INGEST_SECRET` is unset.

The saved document uses the same shape as a collage saved from the editor, including `slideEdits` and `slideBackgrounds`, so view mode and the editor can open it.
