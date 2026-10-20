# 🎵 RIFLX MUSIC BOT

بوت موسيقى لـ Discord مكتوب بـ **Node.js + discord.js v14 + discord-player** — يشغّل الموسيقى من YouTube داخل الصوت مع أوامر Slash.

## ✨ المميزات
| الميزة | التفاصيل |
|---|---|
| أوامر Slash مفتوحة للجميع | `/play` · `/stop` · `/test` — أي عضو في السيرفر يستطيع استعمالها بدون صلاحيات خاصة |
| تشغيل الموسيقى | بحث بالاسم أو رابط YouTube عبر `discord-player-youtubei` |
| FFmpeg مدمج | يستخدم `ffmpeg-static` — لا يحتاج تثبيت FFmpeg على السيرفر |
| إعادة تشغيل تلقائية | تسجيل الأوامر تلقائيًا عند كل إقلاع للبوت |

## 🚀 التشغيل محليًا
```bash
npm install
copy .env.example .env     # ثم ضع DISCORD_TOKEN (و GUILD_ID اختياري)
npm run deploy-commands    # تسجيل أوامر Slash يدويًا (اختياري — البوت يسجّلها تلقائيًا)
npm start
```

## ⚙️ إعداد Discord Developer Portal
1. أنشئ App على [discord.com/developers/applications](https://discord.com/developers/applications) → **Bot** → انسخ الـ **Token**.
2. فعّل **Privileged Gateway Intents**:‏ `Presence Intent` (اختياري) + `Server Members Intent` (اختياري) — البوت يحتاج فقط `Guilds` و `GuildVoiceStates` وهي مفعّلة افتراضيًا.
3. ادعُ البوت بصلاحية **Connect** + **Speak** في قناة صوتية (و **Send Messages** / **Use Application Commands**).

> 💡 أوامر Slash مسجّلة بدون قيود صلاحيات (`default_member_permissions: null`) —
> **كل الأشخاص** في السيرفر يستطيعون استعمال البوت فورًا، بما فيهم `@everyone`.

## 📦 النشر على GitHub
> ملاحظة: مجلد `apostado-bot` هو مشروع آخر ويُستثنى تلقائيًا عبر `.gitignore`.

```bash
git init
git add .
git commit -m "RIFLX MUSIC BOT v1.0.0"
gh repo create RIFLX-MUSIC-BOT --public --source=. --push
# أو بدون gh: أنشئ مستودعًا على github.com ثم:
# git remote add origin https://github.com/USER/RIFLX-MUSIC-BOT.git
# git branch -M main
# git push -u origin main
```

## ☁️ النشر على Railway
1. افتح [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → اختر المستودع.
2. Railway يكتشف Node.js تلقائيًا (NixPACKS) ويستخدم `npm start` — لا يحتاج أي إعداد إضافي.
3. من تبويب **Variables** أضف:
   | المتغير | القيمة | مطلوب؟ |
   |---|---|---|
   | `DISCORD_TOKEN` | توكن البوت | ✅ إجباري |
   | `GUILD_ID` | آيدي السيرفر لتسجيل الأوامر فورًا | مُوصى به |
   | `PATH` | *(لا تغيره)* | — |
4. اضغط **Deploy** — من اللوقات ستظهر:‏ `RIFLX MUSIC BOT online as ...` ثم `✅ Registered ... slash commands`.
5. لإعادة نشر أي تعديل: ادفع إلى `main` وسينشر Railway تلقائيًا.

### 🔊 تشغيل الفيديو/الصوت على Railway
- `ffmpeg-static` ينزّل نسخة Linux تلقائيًا أثناء البناء — يعمل بدون تعديل.
- لا يحتاج البوت لمنفذ مكشوف (خدمة Worker) — إن طلب Railway منتجًا ساخنًا (Service) فلن يؤثر عليه.

## 📁 هيكل المشروع
```
├── index.js            # نقطة التشغيل + معالجة الأوامر
├── commands.js         # تعريفات أوامر Slash + التسجيل التلقائي
├── package.json        # التبعيات + سكربتات npm
├── .env.example        # نموذج متغيرات البيئة
├── .gitignore
└── README.md
```

## 🕹️ الأوامر
| الأمر | الوظيفة |
|---|---|
| `/play <song>` | تشغيل موسيقى في القناة الصوتية الحالية — متاح للجميع |
| `/stop` | إيقاف الموسيقى — متاح للجميع |
| `/test` | التحقق من أن البوت يعمل — متاح للجميع |

> ✅ لا توجد أي قيود على الأوامر: كل الأشخاص يستطيعون استعمالها مباشرة.
