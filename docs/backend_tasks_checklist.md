# Member-2 Tasks Validation Report – Manoj

**Date**: March 26, 2026  
**Tester**: Manoj (Backend Team Member)

## Member-2  Tasks Summary

✅ **Task 1**: Finalise organisation creation API  
   - Endpoint: `POST /api/v1/orgs`  
   - Tested: Admin creates "Screenshot Org", auto-added to `staff` array  
   - Status: **Working** 

✅ **Task 2**: Add/remove/deactivate staff API  
   - `POST /api/v1/admin/staff` → Added nurse "Screenshot Nurse"  
   - `PUT /api/v1/admin/staff/{id}/deactivate` → Removed nurse  
   - Status: **Working**

✅ **Task 3**: Doctors/nurses have correct `user.organisation` access  
   - `GET /api/v1/admin/staff` shows `organization._id` + `role.name`  
   - Nurse properly linked to org with `role: "nurse"`  
   - Status: **Verified**

✅ **Task 4**: Full admin org staff flow  
   - Create org → Add nurse → List staff (total:2) → Deactivate → List (total:1)  
   - Status: **End-to-end working**

## Testing Method
- Swagger UI (localhost:3000/swaggerDocs)  
- Admin JWT authorization  
- MongoDB data verified via API responses  

**All endpoints working as expected.**
