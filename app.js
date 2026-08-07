// ===============================
// ANA IDOS - app.js
// ===============================

// Nastavení dnešního data a času
window.addEventListener("load", () => {

    const now = new Date();

    document.getElementById("date").value =
        now.toISOString().split("T")[0];

    document.getElementById("time").value =
        now.toTimeString().slice(0,5);

});

// ===============================
// Prohození zastávek
// ===============================

document.getElementById("swapButton").addEventListener("click", () => {

    const from = document.getElementById("from");
    const to = document.getElementById("to");

    const temp = from.value;

    from.value = to.value;
    to.value = temp;

});

// ===============================
// Vyhledávání
// ===============================

document.getElementById("searchButton").addEventListener("click", () => {

    const from = document.getElementById("from").value.trim();
    const to = document.getElementById("to").value.trim();
    const time = document.getElementById("time").value;

    if(from === ""){

        alert("Vyplň zastávku Odkud.");

        return;

    }

    if(to === ""){

        alert("Vyplň zastávku Kam.");

        return;

    }

    if(from === to){

        alert("Zastávky jsou stejné.");

        return;

    }

    const results = findConnections(from,to,time);

    showResults(results,from,to);

});

// ===============================
// Zobrazení výsledků
// ===============================

function showResults(results,from,to){

    const container = document.getElementById("results");

    container.innerHTML = "";

    if(results.length === 0){

        container.innerHTML =

        `<div class="resultCard">

            <h2>Žádné spojení nebylo nalezeno.</h2>

        </div>`;

        return;

    }

    results.forEach(connection=>{

        const color = getVehicleColor(connection.type);

        const icon = getVehicleIcon(connection.type);

        const card = document.createElement("div");

        card.className = "resultCard";

        card.innerHTML =

        `
        <div class="departureTime">

            ${connection.departure}

        </div>

        <div class="lineRow">

            <span
                class="lineBadge"
                style="background:${color};">

                ${icon}
                ${connection.line}

            </span>

            <span class="direction">

                ${connection.direction}

            </span>

        </div>

        <div class="times">

            <div>

                <strong>Odjezd</strong><br>

                ${from}<br>

                ${connection.departure}

            </div>

            <div>

                <strong>Příjezd</strong><br>

                ${to}<br>

                ${connection.arrival}

            </div>

        </div>

        `;

        container.appendChild(card);

    });

}

// ===============================
// Enter = hledat
// ===============================

document.getElementById("from").addEventListener("keydown",function(e){

    if(e.key==="Enter")
        document.getElementById("searchButton").click();

});

document.getElementById("to").addEventListener("keydown",function(e){

    if(e.key==="Enter")
        document.getElementById("searchButton").click();

});

document.getElementById("time").addEventListener("keydown",function(e){

    if(e.key==="Enter")
        document.getElementById("searchButton").click();

});
