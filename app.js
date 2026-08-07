// Seznam zastávek (zatím ručně, později se bude načítat z JSON)
const stops = [
    "Anské náměstí",
    "NC Ana",
    "Šerifova",
    "Záhoří"
];

// Naplnění našeptávače zastávek
const datalist = document.getElementById("stops");

stops.forEach(stop => {
    const option = document.createElement("option");
    option.value = stop;
    datalist.appendChild(option);
});

// Nastavení dnešního data
const today = new Date().toISOString().split("T")[0];
document.getElementById("date").value = today;

// Tlačítko pro prohození zastávek
document.getElementById("swapButton").addEventListener("click", () => {
    const from = document.getElementById("from");
    const to = document.getElementById("to");

    const temp = from.value;
    from.value = to.value;
    to.value = temp;
});

// Tlačítko Hledat
document.getElementById("searchButton").addEventListener("click", () => {

    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const time = document.getElementById("time").value;

    const results = document.getElementById("results");

    results.innerHTML = `
        <div class="resultCard">
            <div class="departureTime">${time || "--:--"}</div>

            <div>
                Vyhledávání z <b>${from}</b> do <b>${to}</b> bude dostupné v další části projektu.
            </div>
        </div>
    `;
});
