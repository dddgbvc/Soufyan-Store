# ريلز «اطلب بالواتساب» — مكتب سفيان للموبايل

- `out/sufyan-whatsapp-order-reel.mp4` — the reel (1080×1920, 30 fps, 28.8 s, H.264 + AAC)
- `out/cover.jpg` — cover frame for the reel

## Storyboard

| Time | Scene |
|---|---|
| 0.0 – 2.5 s | «تريد موبايل؟ أو إكسسوار؟» + a gold underline + the WhatsApp icon with pulse rings |
| 2.3 – 11 s | A phone with a WhatsApp chat: the customer types «هلا، عدكم Galaxy A54؟», the ticks turn blue, and the typing dots turn into the logo's bars before the shop replies |
| 7.3 – 9.0 s | The product card lifts out of the screen toward the camera with the labels: كفالة سنة كاملة · مفحوص قبل التسليم · بعلبته وكامل ملحقاته |
| 9 – 11 s | «زين، حطلي وياه سماعة 🎧» ← order confirmation card #1047 |
| 11 – 11.75 s | The camera zooms into the confirmation card, and its mini progress bar grows into the order-tracking panel at the top |
| 11.7 – 15.5 s | A gold box (the brand's packaging colour) opens, the phone and headphones drop in, the flaps close, the brand tape runs across, and the VOID warranty seal is slapped on |
| 15.5 – 20.7 s | The box jumps onto the scooter; the delivery rider sets off from the shop past the Malwiya minaret and the palm trees, sounds «بيب بيب!», and the box hops to the house door, which opens, followed by confetti |
| 21 – 24 s | Back to the chat: «وصل طلبك 🎉», the customer gives five stars «وصل بسرعة، خوش تعامل 👌», and a ❤️ reaction appears |
| 24 – 28.8 s | End card: the logo, «شاشتك الجاية تبدأ من هنا», an «اطلب عبر واتساب» button, 0773 164 4450, the address and the working hours |

The shop details (number, address, hours, tagline, the A54 price and specs, the warranty wording, the VOID seal and the packaging tape) are taken from the brand designs in Canva. To change any of them, edit the `SHOP` object at the top of `reel.html`.

## Rebuild

```sh
./build.sh
```

- `reel.html` is the animation (open it in a browser for a live preview)
- `audio.py` generates the music (120 BPM) and every sound effect → `build/audio.wav`
- `render.cjs` renders the frames with 6-sample motion blur and encodes the MP4
