# 🔧 Fix Error popup.js:6

## ❌ **Problem yang Terjadi:**

Error di popup.js line 6 terjadi karena:

```javascript
const submitBtn = form.querySelector('button[type="submit"]'); // Line 6
```

- `form` adalah null karena `document.getElementById("download-form")` tidak menemukan element
- popup-new.html tidak memiliki element dengan id "download-form" 
- popup.js lama masih mencoba akses DOM dari interface lama

## ✅ **Solution yang Diterapkan:**

### 1. **Fixed Import di popup-new.html:**
```html
<!-- Before (ERROR) -->
<script src="popup.js"></script>

<!-- After (FIXED) -->
<script src="popup-new.js"></script>
```

### 2. **Port Consistency di Semua File:**
- **Server**: PORT 3500 ✅
- **manifest.json**: `http://localhost:3500/*` ✅
- **background.js**: `http://localhost:3500/api/v1/streams/{videoId}` ✅
- **popup-new.js**: `http://localhost:3500/api/v1/streams/${videoId}` ✅
- **popup.js**: `http://localhost:3500/api/v1/streams/{videoId}` ✅

### 3. **File Structure yang Benar:**
```
✅ popup-new.html (Active interface)
   └── popup-new.js (Quality selector logic)

❌ popup.html (Old interface - not used)
   └── popup.js (Old logic - causes error if loaded)
```

## 🎯 **Expected Result:**

Setelah fix ini:
- ✅ **No more popup.js:6 error** 
- ✅ **Quality selector interface works**
- ✅ **All files use consistent port 3500**
- ✅ **Extension loads popup-new.html correctly**

## 🧪 **Testing Steps:**

1. **Reload Extension** di Chrome
2. **Buka video YouTube** 
3. **Klik extension icon**
4. **Check Console** - no more errors
5. **Verify interface** - quality selector muncul

## 📋 **Quick Verification:**

```bash
# Test server health
curl http://localhost:3500/health

# Test API endpoint  
curl http://localhost:3500/api/v1/streams/dQw4w9WgXcQ
```

**Error popup.js:6 sudah teratasi!** 🎉