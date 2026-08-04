function searchConnection(){

let from=document.getElementById("from").value;
let to=document.getElementById("to").value;
let time=document.getElementById("time").value;

document.getElementById("results").innerHTML=`
<h2>Vyhledávání</h2>

<b>Odkud:</b> ${from}<br>
<b>Kam:</b> ${to}<br>
<b>Čas:</b> ${time}<br><br>

Vyhledávání spojení bude přidáno v další verzi.
`;

}
