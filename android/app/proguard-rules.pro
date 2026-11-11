# JavaMail carga sus protocolos por nombre (META-INF) y usa reflexión: no se puede ofuscar ni recortar.
-keep class com.sun.mail.** { *; }
-keep class javax.mail.** { *; }
-keep class javax.activation.** { *; }
-keep class com.sun.activation.** { *; }
-dontwarn java.awt.**
-dontwarn javax.security.sasl.**
-dontwarn javax.naming.**
-dontwarn org.apache.harmony.**
-dontwarn sun.security.**
# El puente con la web se llama por nombre desde JavaScript.
-keepclassmembers class app.casamail.movil.Nativo { @android.webkit.JavascriptInterface <methods>; }
