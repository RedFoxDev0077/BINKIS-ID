# The display case and the matched-set film

Two things the client's animator delivered on 18 October 2026, both of which
the collection page needs and neither of which is in this repository.

- **The display case** (`/vitrina/*`) — the walnut cabinet behind My
  Collection, cut into layers so any of the 256 combinations of the eight
  Classic characters can be lit.
- **The matched-set film** (`/celebracion/mismo-numero.mp4`) — 24 seconds of
  the case filling, ending on the BINKIS ID signature.

They are BINKIS material, not source code, and they are large, so they ship
the same way the character art has shipped since the beginning: on the server,
in a directory the deploy never touches, served straight off disk by Caddy.
See `docs/CHARACTER-MEDIA.md` for the arrangement itself.

## Why the film has no number in it

The client asked whether the animator could change the number in the film to
match each collection. He can, but only by rendering the film again per
number, and the numbers run to 30,000 in the Classic series alone.

So the film is rendered once with the space under the logo deliberately empty,
and the number is drawn over it by the browser, in Outfit 400 and the logo's
own gold gradient. Every collector sees their own number, nothing is rendered
twice, and the alternative on the table — dropping the number entirely — cost
nothing to avoid.

The position, size, colour and timing are all the animator's measurements and
all relative to the film rather than to the screen, so they hold at any size:

| | |
|---|---|
| Centre | 50% across, **58.9%** down |
| Size | **4.2%** of the film's width |
| Enters | **22.0 s**, never before 21.0 s |
| Face | Outfit 400, the face of the logo above it |

They live in `src/app/globals.css` under `.celebracion`. The timing lives in
`src/components/MatchedSetVideo.tsx`. **If the animator re-cuts the film, all
five of those numbers have to be checked**, because nothing in the build can
notice that the number has drifted onto the logo.

## Layout of the case

```
/opt/binkis-id/media/
  vitrina/
    fondo.webp                 the cabinet, all eight niches dark
    espacio-<key>.webp         that niche lit
    placa-<key>.webp           its brass plate lit
    silueta-<key>.webp         the faint silhouette, shown while it is missing
    pieza-<key>.webp           the figure itself
    respaldo-vacia.jpg         a flat fallback, currently unused
  celebracion/
    mismo-numero.mp4           720 x 1280, H.264, faststart, 1.87 MB
```

Keys are the animator's, not ours: `superman`, `supergirl`, `wonderwoman`,
`batman`, `flash`, `cyborg`, `joker`, **`harleyqueen`**. The mapping from the
character code on a serial (`HQ`) to the key (`harleyqueen`) is in
`src/lib/characters/vitrina.ts` and is covered by `tests/unit/17-vitrina.test.ts`,
because a wrong key means a collector owns a figure the case silently never
lights.

Where each layer sits is also in that file, in pixels of the 1170 x 2080
render, copied from the `repisa.json` the animator ships beside the images.
The geometry is in the repository and the images are not, on purpose:
coordinates are checkable source, artwork is not, and holding them here lets
the case render on the server with no round trip, so a collector with
JavaScript off still sees their collection.

## What loads when

A case that is mostly empty costs almost nothing: only the cabinet and the
eight silhouettes are fetched. The lit niche, the plate and the figure are
rendered only for characters the collector actually owns.

| | |
|---|---|
| Empty collection | ~140 KB (cabinet + 8 silhouettes) |
| Each character owned | ~25 KB more |
| All eight | ~340 KB |

## Deploying them

```sh
# on your machine, from the project root
ssh deploy@157.245.251.48 'mkdir -p /opt/binkis-id/media/vitrina /opt/binkis-id/media/celebracion'
scp public/vitrina/*        deploy@157.245.251.48:/opt/binkis-id/media/vitrina/
scp public/celebracion/*    deploy@157.245.251.48:/opt/binkis-id/media/celebracion/

# Caddy gained two handles for these paths, so it needs the new config
sudo -u deploy -H /opt/binkis-id/deploy.sh
```

The cache header is immutable, so a re-cut ships under a new file name and is
pointed at from `src/lib/characters/vitrina.ts` or
`src/lib/characters/media.ts`, rather than quietly replacing a file browsers
have already been told to keep for a year.

## Checking it

```sh
curl -sI https://id.binkis.com/vitrina/fondo.webp | head -3
curl -sI https://id.binkis.com/celebracion/mismo-numero.mp4 | head -3
```

Expect `200`, the right content type, and the immutable cache header. A 404
means the files are not under `/opt/binkis-id/media` or Caddy is still running
the old config.

## Still open with the animator

- The bottom rail of the cabinet doors clips the bases of Joker and Harley.
  Their fix is to raise that row or lower the rail.
- The plates read `THE JOKER` and `THE FLASH`; the client has not confirmed
  whether he wants the article.
- The layers are 1170 px wide, which is a phone at 3x. Only the empty cabinet
  came at 2x. If the case is ever shown larger than a phone column, the rest
  need re-exporting, which the animator offered to do from the same renders.
