pdfjsLib.GlobalWorkerOptions.workerSrc =
'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js';

document.getElementById("convertButton").addEventListener("click", async () => {

    const file = document.getElementById("pdfFile").files[0];

    if (!file) {
        alert("Vyber PDF.");
        return;
    }

    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer
    }).promise;

    let text = "";

    for (let page = 1; page <= pdf.numPages; page++) {

        const p = await pdf.getPage(page);

        const content = await p.getTextContent();

        content.items.forEach(item => {
            text += item.str + "\n";
        });

    }

    document.getElementById("output").textContent = text;

});
