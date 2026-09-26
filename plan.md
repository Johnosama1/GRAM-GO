# Plan for Task Image Upload and Admin UI Redesign (Vercel Blob Integration)

1. **Vercel Blob Setup & Backend Integration (`artifacts/api-server/src/routes/admin.ts`)**:
   - Create an upload endpoint `POST /upload-image` in `artifacts/api-server/src/routes/admin.ts`.
   - The endpoint must use `put` from `@vercel/blob` to handle image upload, requiring the `BLOB_READ_WRITE_TOKEN` environment variable.
   - Restrict allowed content types (`image/png`, `image/jpeg`, `image/webp`).
   - Validate size. Since Express default body limit is `16kb`, we'll need to increase it for this specific endpoint or parse it via multer/busboy. Or wait, Vercel Blob works great with client-side upload or sending base64 to the backend, OR we can accept raw buffer/base64 in the backend.
   - I'll increase the limit for `/upload-image` specifically, and accept `application/json` with a base64 string, so Vercel Blob backend can upload it directly, returning the `blob.url`.

2. **Frontend Admin UI (`artifacts/app/src/pages/AdminPage.tsx`)**:
   - Update the Create Task form to include the `<input type="file" />`.
   - When a file is selected:
     - Client-side validation (max 2MB, png/jpg/webp).
     - Resize client-side using `<canvas>` to max ~300x300 (since it displays at ~60px, 300px is crisp for Retina).
     - Send the resized base64 string to `POST /admin/upload-image`.
     - Update `taskForm.channelPhotoUrl` with the returned Vercel Blob URL.
   - Refactor mobile UI layout: use stack (`flex-direction: column`) to avoid horizontal overflow.

3. **Frontend API integration (`artifacts/app/src/lib/api.ts`)**:
   - Add `adminUploadImage` API call.

4. **Task Display (`artifacts/app/src/pages/TasksPage.tsx`)**:
   - Fix the React anti-pattern! Use state or purely CSS-based fallback logic (e.g. `onError` setting `display: none` on the `<img>` and `display: flex` on a sibling `<span className="fallback-icon">`).
   - Ensure the image uses `object-fit: cover` and `border-radius: 50%`.

5. **Testing & Pre-commit**:
   - Typecheck, build, and verify mobile Admin UI layout.
   - Tell the user to set `BLOB_READ_WRITE_TOKEN`.
   - Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Submit**:
   - Commit and push to GitHub repository.
