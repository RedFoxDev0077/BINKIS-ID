# Character art and animation

The passport hero shows the character: an animation for the eight Classics, a
still for the five Limiteds. This is where those files live and how they get
to the server.

## Why they are not in the repository

They are BINKIS material, not source code, and `.gitignore` has excluded
client-supplied artwork since the beginning. They are also large: the eight
clips are about 11 MB together, which would sit in every clone and every image
layer forever, to be replaced wholesale the next time the client re-cuts them.

So they live on the server, in a directory the deploy never touches, and Caddy
serves them directly.

## Naming

Files are named by the two-letter character code, the same code that starts
every serial. That is the whole lookup: no database column, no admin upload, no
manifest to keep in sync.

```
/opt/binkis-id/media/characters/
  SP.mp4  SP.jpg  SP.png      Superman
  BM.mp4  BM.jpg  BM.png      Batman
  HQ.mp4  HQ.jpg  HQ.png      Harley Quinn
  FL.mp4  FL.jpg  FL.png      The Flash
  WW.mp4  WW.jpg  WW.png      Wonder Woman
  JK.mp4  JK.jpg  JK.png      The Joker
  SG.mp4  SG.jpg  SG.png      Supergirl
  CY.mp4  CY.jpg  CY.png      Cyborg
  RF.png  BZ.png  CH.png  RD.png  GL.png   the Limiteds, still only
```

- `.mp4` the animation, played silently on a loop
- `.jpg` its first frame, shown while the clip loads and instead of it when the
  visitor has asked for reduced motion
- `.png` the still, used for characters with no clip

Which codes have what is declared in `src/lib/characters/media.ts`. A character
missing from that map falls back to the generated panel, so nothing breaks; a
character listed there whose file is missing shows an empty box, which is why
the map is explicit rather than read off disk.

## Format

The clips the client's studio delivers are 2160 x 2160 masters of 8 to 9 MB.
Those are for product pages. This panel loads on every scan, on a phone, in a
shop, on mobile data, so what goes on the server is the web cut:

| | |
|---|---|
| Size | 720 x 720 |
| Codec | H.264, `faststart` |
| Audio | none |
| Weight | under 2 MB, ideally about 1 |
| Poster | first frame, JPG |

## Deploying them

The directory is mounted read-only into the Caddy container as `/srv/media`
(see `docker-compose.yml`), and Caddy serves `/characters/*` from it with a
one-year immutable cache. It is outside the repository checkout, so a deploy
never overwrites or removes it.

```sh
# on your machine, from the project root
ssh deploy@157.245.251.48 'mkdir -p /opt/binkis-id/media/characters'
scp public/characters/* deploy@157.245.251.48:/opt/binkis-id/media/characters/

# first time only, so Caddy picks up the new mount
sudo -u deploy -H /opt/binkis-id/deploy.sh
```

Replacing a character later is a `scp` of that one file. Because the cache
header is immutable, a re-cut of an existing character should ship under a new
name (`HQ-v2.mp4`) and be pointed at from the media map, rather than quietly
replacing a file browsers have already cached for a year.

## Checking it

```sh
curl -sI https://id.binkis.com/characters/HQ.mp4 | head -3
```

Expect `200`, `content-type: video/mp4`, and the immutable cache header. A 404
means the file is not in `/opt/binkis-id/media/characters` or the mount is
missing from the running Caddy container.
