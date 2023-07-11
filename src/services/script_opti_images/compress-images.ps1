# Chemin du dossier contenant les images à convertir
$cheminDossierImages = "C:\Users\andyq\DocumentsAndy\ProjetPro2021_2022\my-makeup\public\assets\cats\10295552-family"

# Construction de la commande pour convertir l'image en WebP avec 75% de qualité
$commande = "C:\Users\andyq\libwebp-1.3.0-windows-x64\bin\cwebp.exe -q 75"

# Obtention de la liste des fichiers d'images dans le dossier
$images = Get-ChildItem -Path $cheminDossierImages -File | Where-Object {
    $_.Extension -match "^(.jpg|.jpeg|.png|.gif)$"
}

# Parcours de chaque fichier d'image
foreach ($image in $images) {
    # Chemin du fichier source
    $cheminFichierSource = $image.FullName

    # Chemin du fichier de destination en WebP
    $cheminFichierDestination = [System.IO.Path]::ChangeExtension($cheminFichierSource, "webp")

    # Exécution de la commande
    $process = Invoke-Expression "$commande `"$cheminFichierSource`" -o `"$cheminFichierDestination`""
}
