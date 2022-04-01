import fs from "fs";
import { parse } from "csv-parse";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

let output = [];
const parser = parse(
  { delimiter: ",", columns: true, group_columns_by_name: true },
  function (err, data) {
    if (err) throw err;
  }
);

fs.createReadStream("./input.csv")
  .pipe(parser)
  .on("data", (data) => formatData(data))
  .on("end", () => {
    cleanOutput();
    let data = JSON.stringify(output, null, "\t");
    fs.writeFileSync("output.json", data);
  });

/**
 * Antes de criar o output.json, verifica se o objeto contém elementos vazios,
 * caso sim, remove-os. Se o objeto incluir '/' ou ',', executa a função split() e trim().
 */

function cleanOutput() {
  output.forEach((pessoa, index) => {
    /** Higienizar Grupos */
    pessoa.groups.forEach((group, i) => {
      const formatter = (splitter) => {
        group
          .split(splitter)
          .map((element) => pessoa.groups.push(element.trim()));

        pessoa.groups.splice(i, 1);
      };

      if (group == "") return pessoa.groups.splice(i, 1);
      if (group.includes("/")) formatter("/");
      if (group.includes(",")) formatter(",");
    });
    let formatted = [...new Set(pessoa.groups)]
      .map((element) => element.trim())
      .sort();
    pessoa.groups = formatted;
  });
}

/**
 * Essa função modifica o objeto recebido pelo csv-parse para se adequar
 * à estrutura JSON solicitada no projeto.
 */

function formatData(data) {
  try {
    let duplicate = false;
    let keys = Object.entries(data);

    /** Se for iterado um eid que já existe, junta os grupos e endereços ao invés de criar
     * uma nova entrada no JSON.
     */
    output.forEach((key, id) => {
      // ? se 'eid' já existir, concat os grupos ao invés de redefinir.
      if (key.eid == data["eid"]) {
        let dataGroups = data["group"];
        key.groups = key.groups.concat(dataGroups);
        for (let i = 0; i < keys.length; i++) {
          if (keys[i][0].includes("email") || keys[i][0].includes("phone")) {
            const addressesWithTags = getAddressesWithTags(data);
            key.addresses = key.addresses.concat(addressesWithTags);
            break;
          }
        }
        duplicate = true;
      }
    });
    if (duplicate) return; // ? se a informação for duplicada, não vai executar o resto do código

    /** Formata os dados para serem usados no JSON per-se. */
    const addressesWithTags = getAddressesWithTags(data);
    const invisibleBool = getInvisibleBool(data["invisible"]);
    const seeAllBool = getSeeAllBool(data["see_all"]);

    let formatted = {
      fullname: data["fullname"],
      eid: data["eid"],
      invisible: invisibleBool,
      see_all: seeAllBool,
      groups: data["group"],
      addresses: addressesWithTags,
    };
    output.push(formatted);
  } catch (err) {
    console.log(err);
  }
}

/**
 * Essa função recebe os dados de email/telefone no esquema retornado pela lib csv-parse:
 * -> 'type Tag_1 Tag_2 Tag_3': 'endereço@gmail.com'
 *
 * E retorna os mesmos dados organizados para serem salvos em JSON:
 * "addresses": [
 *  {
 *    "type": type,
 *    "tags": ["Tag_1", "Tag_2"],
 *    "address": 'endereço@gmail.com'
 *  }
 * ]
 */

function getAddressesWithTags(data) {
  let keys = Object.entries(data);
  let addresses = [];

  function isInvalidCase(key0, key1) {
    if (key1 == "") return true;
    if (key0.includes("email") && !validateEmail(key1)) return true;
    if (key0.includes("phone") && !isValidPhoneNumber(key1, "BR")) return true;
  }

  function pushToAddresses(split, type, address) {
    let formatted = {};

    formatted.type = type;
    split.shift();
    formatted.tags = split;
    formatted.address = address;

    addresses.push(formatted);
  }

  try {
    const CHAVE = 0;
    const VALOR = 1;
    keys.forEach((grupo) => {
      if (grupo[CHAVE].includes("email") || grupo[CHAVE].includes("phone")) {
        let split = grupo[CHAVE].split(" ");

        // ? Se o valor do email conter " " (espaço), só verifica o que vier antes do espaço.
        if (grupo[CHAVE].includes("email") && grupo[VALOR].includes(" ")) {
          let email = grupo[VALOR].split(" ");
          grupo[VALOR] = email[0];
          console.log(email);
        }

        // ? Se o valor conter "/", split e eexecuta separadamente.
        if (grupo[VALOR].includes("/")) {
          grupo[VALOR].split("/").map((element) => {
            if (isInvalidCase(grupo[CHAVE], element) == true) return;
            pushToAddresses(split, split[0], element);
          });
        }

        // ? Verifica se é um caso inválido.
        if (isInvalidCase(grupo[CHAVE], grupo[VALOR]) == true) return;

        // ? Formata o número de telefone.
        if (grupo[CHAVE].includes("phone")) {
          grupo[VALOR] = parsePhoneNumber("+55" + grupo[1]).formatNational();
        }
        pushToAddresses(split, split[0], grupo[VALOR]);
      }
    });

    return addresses;
  } catch (err) {
    console.log(err);
  }
}

/** Transforma valor do campo 'invisible' e 'see_all' em booleans */
function getInvisibleBool(data) {
  if (data == "no" || data == "") return false;
  else return true;
}

function getSeeAllBool(data) {
  if (data == "yes") return true;
  else return false;
}

/** Utilidades */
const validateEmail = (email) => {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
};
