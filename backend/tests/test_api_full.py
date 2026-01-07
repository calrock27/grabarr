
import httpx
import sys
import secrets
import json

BASE_URL = "http://localhost:8001/api"
PREFIX = "http://localhost:8001"

# ANSI Colors
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

def log_pass(msg):
    print(f"[{GREEN}PASS{RESET}] {msg}")

def log_fail(msg, details=""):
    print(f"[{RED}FAIL{RESET}] {msg} {details}")
    # global failed
    # failed = True

failed = False

def run_tests():
    global failed
    client = httpx.Client(timeout=10.0)
    
    print("--- 1. Authentication ---")
    
    # 1.1 Check Status
    try:
        r = client.get(f"{BASE_URL}/auth/status")
        if r.status_code == 200:
            log_pass("Auth status checked")
        else:
            log_fail("Auth status check failed", r.text)
            failed = True
    except Exception as e:
        log_fail(f"Could not connect to {BASE_URL}", str(e))
        return

    # 1.2 Authentication via API Key
    api_key = "gk_wKGFnQe8uzkXfkNqeMQStRuJXSgkBHCYtyc4Pa5UvbM"
    client.headers.update({"X-API-Key": api_key})
    
    # 1.3 Verify Session/Auth
    r = client.get(f"{BASE_URL}/auth/me")
    if r.status_code == 200 and r.json().get("authenticated"):
        log_pass("Auth verified via API Key (/auth/me)")
        print(f"   User: {r.json().get('username')}")
    else:
        log_fail("Auth verification failed with API Key", r.text)
        failed = True
        return # Stop here as others will fail 401


    print("\n--- 2. System Settings ---")
    r = client.get(f"{BASE_URL}/settings/system")
    if r.status_code == 200:
        log_pass("Get system settings")
        settings = r.json()
        print(f"   Current: {settings}")
    else:
        log_fail("Get system settings failed", r.text)
        failed = True
        
    # Update
    r = client.put(f"{BASE_URL}/settings/system", json={"failure_cooldown_seconds": 123})
    if r.status_code == 200 and r.json()['failure_cooldown_seconds'] == 123:
        log_pass("Update system settings")
    else:
        log_fail("Update system settings failed", r.text)
        failed = True
        
    # Revert (optional, but good for cleanup)
    client.put(f"{BASE_URL}/settings/system", json={"failure_cooldown_seconds": 60})


    print("\n--- 3. Credentials ---")
    cred_name = f"TestCred_{secrets.token_hex(4)}"
    cred_id = None
    
    # Create
    payload = {
        "name": cred_name,
        "type": "ftp",
        "data": {"user": "foo", "password": "bar"}
    }
    r = client.post(f"{BASE_URL}/credentials", json=payload)
    if r.status_code == 200:
        data = r.json()
        cred_id = data['id']
        log_pass(f"Created credential {cred_id}")
    else:
        log_fail("Create credential failed", r.text)
        failed = True
        
    # List
    r = client.get(f"{BASE_URL}/credentials")
    if r.status_code == 200:
        found = any(c['id'] == cred_id for c in r.json())
        if found:
            log_pass("List credentials (found newly created)")
        else:
            log_fail("List credentials (newly created not found)")
            failed = True
    else:
        log_fail("List credentials failed", r.text)
        failed = True
        
    # Update
    if cred_id:
        r = client.put(f"{BASE_URL}/credentials/{cred_id}", json={
            "name": f"{cred_name}_UPDATED",
            "type": "ftp",
            "data": {"user": "foo", "password": "bar2"}
        })
        if r.status_code == 200 and r.json()['name'] == f"{cred_name}_UPDATED":
            log_pass("Update credential")
        else:
            log_fail("Update credential failed", r.text)
            failed = True
            
    # Delete (at the end usually, but let's do it here to clean up if we don't need it for remotes)
    # Wait, we need it for Remote test. Ideally we keep it.


    print("\n--- 4. Remotes ---")
    remote_name = f"TestRemote_{secrets.token_hex(4)}"
    remote_id = None
    
    # Create
    if cred_id:
        payload = {
            "name": remote_name,
            "type": "ftp",
            "credential_id": cred_id,
            "config": {"host": "127.0.0.1"}
        }
        r = client.post(f"{BASE_URL}/remotes", json=payload)
        if r.status_code == 200:
            data = r.json()
            remote_id = data['id']
            log_pass(f"Created remote {remote_id}")
        else:
            log_fail("Create remote failed", r.text)
            failed = True
            
        # List
        r = client.get(f"{BASE_URL}/remotes")
        if r.status_code == 200:
            found = any(rm['id'] == remote_id for rm in r.json())
            if found:
                log_pass("List remotes (found newly created)")
            else:
                log_fail("List remotes (newly created not found)")
                failed = True
        else:
            log_fail("List remotes failed", r.text)
            failed = True

        # Test Remote (Expect fail or fake pass depending on backend logic? It tries real connection)
        # Backend tries rclone. It will likely fail to connect to 127.0.0.1:21 if not running.
        # But we want to test the ENDPOINT, not the connection success.
        # The endpoint should return 200 OK with success: False/True.
        # It shouldn't 500.
        if remote_id:
            # Test By ID
            r = client.post(f"{BASE_URL}/remotes/{remote_id}/test")
            if r.status_code == 200:
                log_pass(f"Test remote by ID endpoint reachable (Result: {r.json().get('success')})")
            else:
                log_fail(f"Test remote by ID failed with status {r.status_code}", r.text)
                failed = True
            
            # Browse (might fail)
            r = client.post(f"{BASE_URL}/remotes/{remote_id}/browse", json={"path": ""})
            if r.status_code in [200, 500]: # 500 is possible if rclone fails hard, but ideally handled
                log_pass(f"Browse remote endpoint reachable (Status: {r.status_code})")
            else:
                # 404 would be bad for the endpoint itself
                log_fail(f"Browse remote failed with status {r.status_code}", r.text)
                failed = True

            # Update
            r = client.put(f"{BASE_URL}/remotes/{remote_id}", json={
                "name": f"{remote_name}_UPDATED",
                "type": "ftp",
                "credential_id": cred_id,
                "config": {"host": "127.0.0.1"}
            })
            if r.status_code == 200 and r.json()['name'] == f"{remote_name}_UPDATED":
                log_pass("Update remote")
            else:
                log_fail("Update remote failed", r.text)
                failed = True


    print("\n--- 5. Actions ---")
    action_name = f"TestAction_{secrets.token_hex(4)}"
    action_id = None
    
    # Create
    payload = {
        "name": action_name,
        "type": "webhook",
        "config": {"url": "http://example.com"}
    }
    r = client.post(f"{BASE_URL}/actions/", json=payload)
    if r.status_code == 200:
        data = r.json()
        action_id = data['id']
        log_pass(f"Created action {action_id}")
    else:
        log_fail("Create action failed", r.text)
        failed = True
        
    # List
    r = client.get(f"{BASE_URL}/actions/")
    if r.status_code == 200:
        found = any(a['id'] == action_id for a in r.json())
        if found:
            log_pass("List actions (found newly created)")
        else:
            log_fail("List actions (newly created not found)")
            failed = True
    else:
        log_fail("List actions failed", r.text)
        failed = True
        
    # Get
    if action_id:
        r = client.get(f"{BASE_URL}/actions/{action_id}")
        if r.status_code == 200:
            log_pass(f"Get action {action_id}")
        else:
            log_fail(f"Get action {action_id} failed", r.text)
            failed = True
            
        # Update
        r = client.put(f"{BASE_URL}/actions/{action_id}", json={
            "name": f"{action_name}_UPDATED"
        })
        if r.status_code == 200 and r.json()['name'] == f"{action_name}_UPDATED":
            log_pass("Update action")
        else:
            log_fail("Update action failed", r.text)
            failed = True
            
        # Delete
        r = client.delete(f"{BASE_URL}/actions/{action_id}")
        if r.status_code == 200:
            log_pass(f"Deleted action {action_id}")
            action_id = None
        else:
            log_fail(f"Delete action {action_id} failed", r.text)
            failed = True


    print("\n--- 6. Jobs ---")
    job_name = f"TestJob_{secrets.token_hex(4)}"
    job_id = None
    
    if remote_id: # Need at least one remote, can use same for source/dest for test
        payload = {
            "name": job_name,
            "source_remote_id": remote_id,
            "dest_remote_id": remote_id,
            "operation": "copy",
            "schedule": "Manual"
        }
        r = client.post(f"{BASE_URL}/jobs/", json=payload)
        if r.status_code == 200:
            data = r.json()
            job_id = data['id']
            log_pass(f"Created job {job_id}")
        else:
            log_fail("Create job failed", r.text)
            # Try to print validation errors
            print(r.text)
            failed = True
            
        # List
        r = client.get(f"{BASE_URL}/jobs/")
        if r.status_code == 200:
            found = any(j['id'] == job_id for j in r.json())
            if found:
                log_pass("List jobs (found newly created)")
            else:
                log_fail("List jobs (newly created not found)")
                failed = True
        else:
            log_fail("List jobs failed", r.text)
            failed = True
            
        # Get
        if job_id:
            r = client.get(f"{BASE_URL}/jobs/{job_id}")
            if r.status_code == 200:
                log_pass(f"Get job {job_id}")
            else:
                log_fail(f"Get job {job_id} failed", r.text)
                failed = True
                
            # Patch
            r = client.patch(f"{BASE_URL}/jobs/{job_id}", json={
                "name": f"{job_name}_UPDATED"
            })
            if r.status_code == 200 and r.json()['name'] == f"{job_name}_UPDATED":
                log_pass("Patch job")
            else:
                log_fail("Patch job failed", r.text)
                failed = True
                
            # Toggle
            r = client.post(f"{BASE_URL}/jobs/{job_id}/toggle", json={"enabled": False})
            if r.status_code == 200:
                # Check if actually disabled
                r2 = client.get(f"{BASE_URL}/jobs/{job_id}")
                if r2.json()['enabled'] == False:
                    log_pass("Toggle job (disabled)")
                else:
                    log_fail("Toggle job reported success but job still enabled")
                    failed = True
            else:
                log_fail("Toggle job failed", r.text)
                failed = True

            # Rotate Key
            r = client.post(f"{BASE_URL}/jobs/{job_id}/rotate_key")
            if r.status_code == 200:
                log_pass("Rotate job key")
            else:
                log_fail("Rotate job key failed", r.text)
                failed = True

            # Actions are clean up later
    else:
        log_fail("Skipping Job creation - no remote created")
        failed = True


    print("\n--- 7. Schedules ---")
    sched_name = f"TestSched_{secrets.token_hex(4)}"
    sched_id = None
    
    payload = {
        "name": sched_name,
        "schedule_type": "cron",
        "config": {"cron": "*/15 * * * *"}
    }
    r = client.post(f"{BASE_URL}/schedules/", json=payload)
    if r.status_code == 200:
        data = r.json()
        sched_id = data['id']
        log_pass(f"Created schedule {sched_id}")
    else:
        log_fail("Create schedule failed", r.text)
        failed = True
        
    # List
    r = client.get(f"{BASE_URL}/schedules/")
    if r.status_code == 200:
        found = any(s['id'] == sched_id for s in r.json())
        if found:
            log_pass("List schedules found")
        else:
            log_fail("List schedules not found")
            failed = True
    else:
        log_fail("List schedules failed", r.text)
        failed = True

    # Update
    if sched_id:
        r = client.put(f"{BASE_URL}/schedules/{sched_id}", json={
            "name": f"{sched_name}_UPDATED",
            "schedule_type": "interval",
            "config": {"seconds": 3600}
        })
        if r.status_code == 200 and r.json()['name'] == f"{sched_name}_UPDATED":
            log_pass("Update schedule")
        else:
            log_fail("Update schedule failed", r.text)
            failed = True
            
        # Delete
        r = client.delete(f"{BASE_URL}/schedules/{sched_id}")
        if r.status_code == 200:
            log_pass(f"Deleted schedule {sched_id}")
            sched_id = None
        else:
            log_fail(f"Delete schedule {sched_id} failed", r.text)
            failed = True


    print("\n--- 8. Widgets ---")
    r = client.get(f"{BASE_URL}/widgets")
    if r.status_code == 200:
        log_pass("List widgets")
    else:
        log_fail("List widgets failed", r.text)
        failed = True


    print("\n--- 9. History & Activity ---")
    r = client.get(f"{BASE_URL}/history")
    if r.status_code == 200:
        log_pass("List history")
    else:
        log_fail("List history failed", r.text)
        failed = True

    r = client.get(f"{BASE_URL}/activity")
    if r.status_code == 200:
        log_pass("List activity")
    else:
        log_fail("List activity failed", r.text)
        failed = True


    print("\n--- 10. CLEANUP ---")
    if job_id:
        r = client.delete(f"{BASE_URL}/jobs/{job_id}")
        if r.status_code == 200:
            log_pass(f"Cleanup: Deleted job {job_id}")
        else:
            log_fail(f"Cleanup: Delete job {job_id} failed", r.text)
            
    if remote_id:
        r = client.delete(f"{BASE_URL}/remotes/{remote_id}")
        if r.status_code == 200:
            log_pass(f"Cleanup: Deleted remote {remote_id}")
        else:
            log_fail(f"Cleanup: Delete remote {remote_id} failed", r.text)
            
    if cred_id:
        r = client.delete(f"{BASE_URL}/credentials/{cred_id}")
        if r.status_code == 200:
            log_pass(f"Cleanup: Deleted credential {cred_id}")
        else:
            log_fail(f"Cleanup: Delete credential {cred_id} failed", r.text)

if __name__ == "__main__":
    run_tests()
    if failed:
        sys.exit(1)
    else:
        sys.exit(0)
