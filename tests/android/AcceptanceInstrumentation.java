// SPDX-License-Identifier: AGPL-3.0-only
package io.github.styayur.gitpadplus.acceptance;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Test-only, separately packaged instrumentation. Never embedded in the product. */
public final class AcceptanceInstrumentation extends Instrumentation {
    private WebView web;
    private Bundle arguments;
    private volatile Activity resumed;
    private String fixtureInfo="null";
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments=args; start(); }
    private WebView find(View view) {
        if(view instanceof WebView)return (WebView)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
            WebView result=find(((ViewGroup)view).getChildAt(i));if(result!=null)return result;
        }
        return null;
    }
    private String evaluate(String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
        runOnMainSync(()->web.evaluateJavascript(script,value->{result.set(value);latch.countDown();}));
        if(!latch.await(30,TimeUnit.SECONDS))throw new IOException("WebView evaluation timed out");
        return result.get();
    }
    public final class NativeActions {
        @JavascriptInterface public String sourcePairDigest(String id, boolean trash) throws Exception {
            if (!id.matches("[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}"))
                throw new IllegalArgumentException("Expected synthetic document UUIDv7");
            File vault = new File(getTargetContext().getFilesDir().getCanonicalFile(), "Vault");
            String[] paths = trash ? new String[]{".gitpad/trash/"+id+"/document.md", ".gitpad/trash/"+id+"/sidecar.json"}
                : new String[]{"Journal/"+id+".md", ".gitpad/anchors/"+id+".json"};
            org.json.JSONArray hashes = new org.json.JSONArray();
            for (String path : paths) {
                byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(java.nio.file.Files.readAllBytes(new File(vault,path).toPath()));
                StringBuilder value = new StringBuilder();
                for (byte part : digest) value.append(String.format("%02x",part));
                hashes.put(value.toString());
            }
            return hashes.toString();
        }
        @JavascriptInterface public void swipe(float x1,float y1,float x2,float y2,float viewportWidth) {
            int[] position=new int[2];float[] scale=new float[1];
            runOnMainSync(()->{web.getLocationOnScreen(position);scale[0]=web.getWidth()/viewportWidth;});
            long down=SystemClock.uptimeMillis();
            MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
            MotionEvent.PointerCoords coordinates=new MotionEvent.PointerCoords();coordinates.pressure=1;coordinates.size=1;
            for(int step=0;step<=12;step++){
                coordinates.x=position[0]+(x1+(x2-x1)*step/12)*scale[0];
                coordinates.y=position[1]+(y1+(y2-y1)*step/12)*scale[0];
                int action=step==0?MotionEvent.ACTION_DOWN:step==12?MotionEvent.ACTION_UP:MotionEvent.ACTION_MOVE;
                MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{coordinates},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
                try{sendPointerSync(event);}finally{event.recycle();}
                SystemClock.sleep(16);
            }
        }
        @JavascriptInterface public String pluginStorageDigest() throws Exception {
            File file=new File(getTargetContext().getFilesDir().getCanonicalFile(),"Vault/.gitpad/plugins/native-qualification-example.json");
            if(!file.isFile())return "missing";
            byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(java.nio.file.Files.readAllBytes(file.toPath()));
            StringBuilder value=new StringBuilder();for(byte b:digest)value.append(String.format("%02x",b));return value.toString();
        }
        @JavascriptInterface public String fixtureInfo(){return fixtureInfo;}
        @JavascriptInterface public String memory(){return "{\"pssKilobytes\":"+android.os.Debug.getPss()+",\"nativeHeapAllocatedBytes\":"+android.os.Debug.getNativeHeapAllocatedSize()+"}";}
        @JavascriptInterface public String clipboardText(){
            AtomicReference<String> value=new AtomicReference<>("");
            runOnMainSync(()->{android.content.ClipboardManager manager=(android.content.ClipboardManager)getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE);ClipData clip=manager.getPrimaryClip();if(clip!=null&&clip.getItemCount()>0)value.set(clip.getItemAt(0).coerceToText(getTargetContext()).toString());});return value.get();
        }
        @JavascriptInterface public void openUri(String uri){
            if(!uri.startsWith("gitpadplus://note/"))throw new IllegalArgumentException("Only local test-note links");
            getTargetContext().startActivity(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(uri)).setPackage("io.github.styayur.gitpadplus").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        @JavascriptInterface public String geometry() {
            int[] values=new int[4];runOnMainSync(()->{web.getLocationOnScreen(values);values[2]=web.getWidth();values[3]=web.getHeight();});
            return java.util.Arrays.toString(values);
        }
        @JavascriptInterface public void paste(String text) {
            runOnMainSync(()->((android.content.ClipboardManager)getTargetContext().getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("GitPad acceptance",text)));
            long now=SystemClock.uptimeMillis();
            sendKeySync(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_V,0,KeyEvent.META_CTRL_ON));
            sendKeySync(new KeyEvent(now,now,KeyEvent.ACTION_UP,KeyEvent.KEYCODE_V,0,KeyEvent.META_CTRL_ON));
        }
        @JavascriptInterface public void key(int code) {sendKeyDownUpSync(code);}
        @JavascriptInterface public void hideKeyboard(){runOnMainSync(()->((android.view.inputmethod.InputMethodManager)getTargetContext().getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(),0));}
        @JavascriptInterface public boolean keyboardVisible(){
            AtomicReference<Boolean> visible=new AtomicReference<>(false);
            runOnMainSync(()->{if(Build.VERSION.SDK_INT>=30){var insets=web.getRootWindowInsets();visible.set(insets!=null&&insets.isVisible(WindowInsets.Type.ime()));}});
            return visible.get();
        }
        @JavascriptInterface public String layoutDiagnostics(){
            AtomicReference<String> value=new AtomicReference<>("");
            runOnMainSync(()->{
                org.json.JSONArray chain=new org.json.JSONArray();
                for(View view=web;view!=null;view=view.getParent() instanceof View?(View)view.getParent():null){
                    chain.put(view.getClass().getName()+" size="+view.getWidth()+"x"+view.getHeight()+" padding="+view.getPaddingLeft()+","+view.getPaddingTop()+","+view.getPaddingRight()+","+view.getPaddingBottom());
                }
                var insets=web.getRootWindowInsets();
                value.set("softInputMode="+(resumed==null?-1:resumed.getWindow().getAttributes().softInputMode)+"; chain="+chain+"; imeBottom="+(Build.VERSION.SDK_INT>=30&&insets!=null?insets.getInsets(WindowInsets.Type.ime()).bottom:-1));
            });return value.get();
        }
        @JavascriptInterface public boolean dismissKeyboardOnboarding(){
            var root=getUiAutomation().getRootInActiveWindow();
            if(root==null||!"com.google.android.inputmethod.latin".contentEquals(root.getPackageName())||root.findAccessibilityNodeInfosByText("Try out your stylus").isEmpty())return false;
            var buttons=root.findAccessibilityNodeInfosByText("Cancel");
            if(buttons.size()!=1||!buttons.get(0).performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK))throw new IllegalStateException("Cannot dismiss the identified Gboard tutorial");
            return true;
        }
        @JavascriptInterface public void press(float x,float y,float viewportWidth,int duration) {
            int[] position=new int[2];float[] scale=new float[1];
            runOnMainSync(()->{web.getLocationOnScreen(position);scale[0]=web.getWidth()/viewportWidth;});
            long now=SystemClock.uptimeMillis();float px=position[0]+x*scale[0],py=position[1]+y*scale[0];
            MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
            MotionEvent.PointerCoords coordinates=new MotionEvent.PointerCoords();coordinates.x=px;coordinates.y=py;coordinates.pressure=1;coordinates.size=1;
            sendPointerSync(MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{coordinates},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0));
            SystemClock.sleep(Math.max(50,Math.min(duration,2000)));
            sendPointerSync(MotionEvent.obtain(now,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{coordinates},0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0));
        }
        @JavascriptInterface public void screenshot(String name) throws IOException {
            if(!name.matches("[a-z0-9-]+"))throw new IOException("Invalid screenshot name");
            File directory=new File(getTargetContext().getExternalFilesDir(null),"acceptance");
            if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Screenshot directory unavailable");
            android.graphics.Bitmap bitmap=getUiAutomation().takeScreenshot();
            if(bitmap==null)throw new IOException("Screenshot unavailable");
            try(FileOutputStream output=new FileOutputStream(new File(directory,name+".png"))){bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output);}finally{bitmap.recycle();}
        }
    }
    private void seedFixture(String source,File target) throws IOException {
        String[] children=getContext().getAssets().list(source);
        if(children.length>0){if(!target.isDirectory()&&!target.mkdirs())throw new IOException("Cannot create fixture directory");for(String child:children)seedFixture(source+"/"+child,new File(target,child));}
        else try(InputStream input=getContext().getAssets().open(source);FileOutputStream output=new FileOutputStream(target)){input.transferTo(output);}
    }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            ((Application)getTargetContext().getApplicationContext()).registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks(){
                public void onActivityCreated(Activity activity,Bundle state){}
                public void onActivityStarted(Activity activity){}
                public void onActivityResumed(Activity activity){resumed=activity;}
                public void onActivityPaused(Activity activity){}
                public void onActivityStopped(Activity activity){}
                public void onActivitySaveInstanceState(Activity activity,Bundle state){}
                public void onActivityDestroyed(Activity activity){}
            });
            String phase=arguments.getString("phase","initial");
            if(phase.equals("clear")&&(!"true".equals(arguments.getString("disposable"))||!(Build.HARDWARE.equals("ranchu")||Build.FINGERPRINT.contains("sdk_gphone"))))throw new IOException("Clear requires an explicitly disposable emulator");
            if((phase.equals("ui-two-pane")||phase.equals("trash")||phase.startsWith("writing-end"))&&(!"true".equals(arguments.getString("disposable"))||!(Build.HARDWARE.equals("ranchu")||Build.FINGERPRINT.contains("sdk_gphone"))))throw new IOException("Writing/trash tests require an explicitly disposable emulator");
            if(phase.startsWith("performance")){
                if(!"true".equals(arguments.getString("disposable"))||!(Build.HARDWARE.equals("ranchu")||Build.FINGERPRINT.contains("sdk_gphone")))throw new IOException("Performance seeding requires an explicitly disposable emulator");
                File vault=new File(getTargetContext().getFilesDir().getCanonicalFile(),"Vault");
                if(!new File(vault,".gitpad-owned").isFile())throw new IOException("Initialize the disposable app vault before seeding");
                try(InputStream input=getContext().getAssets().open("fixture-info.json")){fixtureInfo=new String(input.readAllBytes(),StandardCharsets.UTF_8);}
                if(phase.equals("performance")){
                    for(String file:getContext().getAssets().list("fixture/Journal")){
                        File head=new File(vault,".gitpad/heads/"+file.substring(0,file.length()-3)+".json");
                        if(head.exists()&&!head.delete())throw new IOException("Cannot reset generated fixture head");
                    }
                    seedFixture("fixture/Journal",new File(vault,"Journal"));
                    seedFixture("fixture/anchors",new File(vault,".gitpad/anchors"));
                }
            }
            Intent intent=getTargetContext().getPackageManager().getLaunchIntentForPackage("io.github.styayur.gitpadplus");
            if(intent==null)throw new IOException("Target app missing");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);Activity first=startActivitySync(intent);
            if(phase.equals("recreate")||phase.equals("smoke-recreate")){
                runOnMainSync(first::recreate);
                for(int attempt=0;attempt<240&&(resumed==null||resumed==first);attempt++)SystemClock.sleep(500);
                if(resumed==null||resumed==first)throw new IOException("Activity recreation did not resume a new instance");
            }
            if(phase.equals("resume")||phase.equals("smoke-resume")){
                getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME);
                SystemClock.sleep(2000);getTargetContext().startActivity(intent);
                boolean foreground=false;
                for(int attempt=0;attempt<240;attempt++){if(getUiAutomation().getRootInActiveWindow()!=null&&"io.github.styayur.gitpadplus".contentEquals(getUiAutomation().getRootInActiveWindow().getPackageName())){foreground=true;break;}SystemClock.sleep(500);}
                if(!foreground)throw new IOException("Target did not return to the foreground");
            }
            Activity activity=resumed==null?first:resumed;
            for(int attempt=0;attempt<240&&web==null;attempt++){
                runOnMainSync(()->web=find(activity.getWindow().getDecorView()));if(web==null)SystemClock.sleep(500);
            }
            if(web==null)throw new IOException("Native WebView missing");
            // Android exposes a newly added interface on the next page load.
            runOnMainSync(()->{web.addJavascriptInterface(new NativeActions(),"NativeAcceptance");web.reload();});
            boolean loaded=false;
            for(int attempt=0;attempt<240;attempt++){
                if("true".equals(evaluate("typeof NativeAcceptance==='object' && !!window.HybridWebView && document.readyState==='complete'"))){loaded=true;break;}
                SystemClock.sleep(500);
            }
            if(!loaded)throw new IOException("Test interface/page load timed out");
            if(!phase.matches("[a-z-]+"))throw new IOException("Invalid phase");
            String source;
            try(InputStream input=getContext().getAssets().open("scenario.js")){source=new String(input.readAllBytes(),StandardCharsets.UTF_8);}
            evaluate("window.__acceptancePhase='"+phase+"';"+source);
            String report=null;
            for(int attempt=0;attempt<600;attempt++){
                report=evaluate("JSON.stringify(window.__nativeAcceptanceReport??null)");
                if(report!=null&&!report.equals("\"null\"")&&!report.equals("null"))break;
                SystemClock.sleep(500);
            }
            if(report==null||report.equals("\"null\"")||report.equals("null"))throw new IOException("Scenario timeout");
            // evaluateJavascript returns a JSON-encoded string; decode without altering the report.
            String decoded=new org.json.JSONTokener(report).nextValue().toString();
            org.json.JSONObject reportObject=new org.json.JSONObject(decoded);
            if(phase.equals("clear")&&reportObject.getBoolean("passed")){
                File sentinel=new File(getTargetContext().getFilesDir().getCanonicalFile(),"acceptance-clear-external-sentinel.txt");
                try(FileOutputStream output=new FileOutputStream(sentinel)){output.write("Disposable test file outside the managed vault".getBytes(StandardCharsets.UTF_8));}
                evaluate("[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='Confirm permanent deletion').click()");
                boolean cleared=false;
                for(int attempt=0;attempt<240;attempt++){
                    if("true".equals(evaluate("document.documentElement.dataset.workspaceReady==='true' && !document.querySelector('[role=alertdialog]') && !document.querySelector('.ProseMirror') && document.querySelectorAll('nav[aria-label=Notes] button').length===0"))){cleared=true;break;}
                    SystemClock.sleep(500);
                }
                File vault=new File(getTargetContext().getFilesDir().getCanonicalFile(),"Vault");
                File[] notes=new File(vault,"Journal").listFiles(),assets=new File(vault,"Assets").listFiles();
                if(!cleared||notes==null||notes.length!=0||assets==null||assets.length!=0||new File(vault,".gitpad-clear.json").exists()||!sentinel.isFile())throw new IOException("Confirmed native clear did not leave an empty managed vault and retain the external sentinel");
                new NativeActions().screenshot("clear-native-completed");
                reportObject.getJSONArray("checks").put(new org.json.JSONObject().put("name","Confirmed UI clear reloads empty workspace, removes source/assets, retains external sentinel").put("passed",true));
            }
            reportObject.put("activityRecreationVerified",phase.endsWith("recreate")&&resumed!=first);
            reportObject.put("backgroundForegroundRequested",phase.endsWith("resume"));
            result.putString("report",reportObject.toString());
            boolean passed=reportObject.getBoolean("passed");
            runOnMainSync(()->web.removeJavascriptInterface("NativeAcceptance"));
            finish(passed?Activity.RESULT_OK:Activity.RESULT_CANCELED,result);
        }catch(Throwable error){result.putString("failure",android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,result);}
    }
}
