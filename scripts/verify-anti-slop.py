import os
import sys
import json

sys.path.insert(0, '/home/deploy/.venv-pw/lib/python3.12/site-packages')
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:4173/"
OUT_DIR = "/home/deploy/workspace/shouldknow-ai/audit-frames"
os.makedirs(OUT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    
    # 1. Desktop Test (German Default)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: console_errors.append(str(err)))
    
    page.goto(BASE_URL, wait_until="networkidle")
    page.wait_for_timeout(600)
    
    # German Hero & Signals
    desktop_de = os.path.join(OUT_DIR, "frame-01-signals-de.png")
    page.screenshot(path=desktop_de, full_page=False)
    print(f"Captured: {desktop_de}")
    
    # German Registry Ledger
    registry_nav = page.locator(".nav-link", has_text="Register")
    registry_nav.click()
    page.wait_for_timeout(500)
    
    # Scroll slightly down to showcase the broadsheet ledger table
    page.evaluate("window.scrollTo(0, 480)")
    page.wait_for_timeout(400)
    
    registry_ledger_de = os.path.join(OUT_DIR, "frame-02-ledger-de.png")
    page.screenshot(path=registry_ledger_de, full_page=False)
    print(f"Captured: {registry_ledger_de}")
    
    # Open Dossier in German
    page.locator(".ledger-row").first.click()
    page.wait_for_timeout(500)
    
    dossier_de = os.path.join(OUT_DIR, "frame-03-dossier-de.png")
    page.screenshot(path=dossier_de, full_page=False)
    print(f"Captured: {dossier_de}")
    
    # Close dossier
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    
    # Switch to English
    en_btn = page.locator(".lang-btn", has_text="EN")
    en_btn.click()
    page.wait_for_timeout(400)
    
    registry_ledger_en = os.path.join(OUT_DIR, "frame-04-ledger-en.png")
    page.screenshot(path=registry_ledger_en, full_page=False)
    print(f"Captured: {registry_ledger_en}")
    
    # Open Dossier in English
    page.locator(".ledger-row").first.click()
    page.wait_for_timeout(500)
    
    dossier_en = os.path.join(OUT_DIR, "frame-05-dossier-en.png")
    page.screenshot(path=dossier_en, full_page=False)
    print(f"Captured: {dossier_en}")
    
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    
    page.close()
    context.close()
    
    # Mobile Test (390px)
    mobile_page = browser.new_page(viewport={"width": 390, "height": 844})
    mobile_page.goto(BASE_URL, wait_until="networkidle")
    mobile_page.wait_for_timeout(600)
    
    overflow = mobile_page.evaluate("() => document.documentElement.scrollWidth > document.documentElement.clientWidth")
    scroll_w = mobile_page.evaluate("() => document.documentElement.scrollWidth")
    client_w = mobile_page.evaluate("() => document.documentElement.clientWidth")
    
    mobile_frame = os.path.join(OUT_DIR, "frame-06-mobile.png")
    mobile_page.screenshot(path=mobile_frame, full_page=False)
    print(f"Captured: {mobile_frame} | Overflow: {overflow} (scrollWidth={scroll_w}, clientWidth={client_w})")
    
    mobile_page.close()
    browser.close()
    
    print("\n--- FINAL AUDIT VERDICT ---")
    print(f"Console Errors: {len(console_errors)}")
    print(f"Mobile Overflow Check: {'PASS (0px)' if not overflow else 'FAIL'}")
